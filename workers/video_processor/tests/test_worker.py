import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('video_worker', Path(__file__).parents[1] / 'video_worker.py')
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)

JOB = {'id': '11111111-1111-4111-8111-111111111111', 'lease_token': '22222222-2222-4222-8222-222222222222',
       'project_id': '33333333-3333-4333-8333-333333333333', 'source_path': 'profile/original.mov', 'source_size': 8}


class FakeRepository:
    def __init__(self, completion='success'):
        self.completion = completion
        self.uploaded = {}
        self.removed = []
        self.calls = []
        self.downloads = []

    def rpc(self, name, args):
        self.calls.append((name, args))
        if name == 'complete_video_processing' and self.completion in ('ambiguous', 'committed'):
            raise TimeoutError('Connection timed out after sending completion')
        return True

    def owns_completed_output(self, job, path):
        return self.completion == 'committed'

    def download(self, path, target, expected_size, pulse):
        pulse()
        self.downloads.append((path, expected_size))
        target.write(b'x' * expected_size)

    def upload(self, path, data, mime):
        self.uploaded[path] = (data, mime)

    def remove(self, paths):
        self.removed.extend(paths)


def fake_transcode(source, destination, pulse, deadline):
    destination.write_bytes(b'playback')
    return {'width': 160, 'height': 120, 'duration': 1}


class RecoveryTests(unittest.TestCase):
    @patch.object(worker, 'transcode', side_effect=fake_transcode)
    def test_success_preserves_original_and_completes_with_lease(self, _):
        repo = FakeRepository()
        worker.process_job(repo, JOB)
        self.assertEqual(repo.downloads, [('profile/original.mov', 8)])
        self.assertNotIn(JOB['source_path'], repo.uploaded)
        self.assertEqual(repo.removed, [])
        complete = next(args for name, args in repo.calls if name == 'complete_video_processing')
        self.assertEqual(complete['p_lease_token'], JOB['lease_token'])
        self.assertEqual(complete['p_size'], 8)

    @patch.object(worker, 'transcode', side_effect=fake_transcode)
    def test_ambiguous_inflight_completion_never_deletes_output(self, _):
        repo = FakeRepository('ambiguous')
        worker.process_job(repo, JOB)
        self.assertTrue(repo.uploaded)
        self.assertEqual(repo.removed, [])

    @patch.object(worker, 'transcode', side_effect=fake_transcode)
    def test_lost_committed_response_is_success_without_failure(self, _):
        repo = FakeRepository('committed')
        worker.process_job(repo, JOB)
        self.assertFalse(any(name == 'fail_video_processing' for name, _ in repo.calls))
        self.assertEqual(repo.removed, [])

    @patch.object(worker, 'transcode', side_effect=worker.LostLease())
    def test_stale_worker_cannot_report_failure(self, _):
        repo = FakeRepository()
        worker.process_job(repo, JOB)
        self.assertFalse(any(name == 'fail_video_processing' for name, _ in repo.calls))
        self.assertNotIn(JOB['source_path'], repo.removed)

    @patch.object(worker, 'transcode', side_effect=worker.ConversionError('Unreadable video'))
    def test_bad_video_marks_failure_without_removing_original(self, _):
        repo = FakeRepository()
        worker.process_job(repo, JOB)
        failed = next(args for name, args in repo.calls if name == 'fail_video_processing')
        self.assertFalse(failed['p_retryable'])
        self.assertEqual(repo.removed, [])

    @patch.object(worker, 'PART_BYTES', 5)
    @patch.object(worker, 'transcode', side_effect=fake_transcode)
    def test_large_source_and_output_use_canonical_parts(self, _):
        repo = FakeRepository()
        job = {**JOB, 'source_path': JOB['source_path'] + worker.SUFFIX, 'source_multipart': worker.multipart_spec(8)}
        worker.process_job(repo, job)
        self.assertEqual([size for _, size in repo.downloads], [5, 3])
        paths = sorted(repo.uploaded, key=lambda path: (not '.parts/' in path, path))
        self.assertTrue(paths[0].endswith('.parts/000000'))
        self.assertTrue(paths[1].endswith('.parts/000001'))
        self.assertEqual(json.loads(repo.uploaded[paths[2]][0]), worker.multipart_spec(8))

    @patch.object(worker, 'transcode', side_effect=fake_transcode)
    def test_uncertain_upload_cleans_only_its_attempt(self, _):
        repo = FakeRepository()
        def failed_upload(path, data, mime):
            repo.uploaded[path] = (data, mime)
            raise TimeoutError()
        repo.upload = failed_upload
        worker.process_job(repo, JOB)
        self.assertEqual(repo.removed, list(repo.uploaded))
        self.assertTrue(all(JOB['lease_token'] in path for path in repo.removed))


class MultipartUploadTests(unittest.TestCase):
    @patch.object(worker, 'PART_BYTES', 5)
    def test_uploads_are_bounded_heartbeat_continues_and_manifest_is_last(self):
        repo = FakeRepository()
        lock = threading.Lock()
        active = 0
        maximum = 0
        pulses = []
        def upload(path, data, mime):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum, active)
            time.sleep(0.3)
            with lock:
                repo.uploaded[path] = (data, mime)
                active -= 1
        repo.upload = upload
        attempted = []
        payload = b'abcdefghijklmnopqrstuvw'
        worker.upload_parts(repo, io.BytesIO(payload), 'attempt/manifest', worker.multipart_spec(len(payload)), attempted,
                            lambda: pulses.append(time.monotonic()))
        self.assertEqual(maximum, 2)
        self.assertGreaterEqual(len(pulses), 5)
        self.assertEqual(list(repo.uploaded)[-1], 'attempt/manifest')
        self.assertEqual(b''.join(repo.uploaded[path][0] for path in sorted(repo.uploaded) if '.parts/' in path), payload)
        self.assertEqual(len(attempted), 6)

    @patch.object(worker, 'PART_BYTES', 5)
    @patch.object(worker, 'transcode', side_effect=fake_transcode)
    def test_failed_part_drains_inflight_upload_before_cleanup_and_never_publishes(self, _):
        repo = FakeRepository()
        both_started = threading.Barrier(2)
        def upload(path, data, mime):
            both_started.wait(timeout=3)
            if path.endswith('000000'):
                raise TimeoutError('uncertain upload response')
            time.sleep(0.15)
            repo.uploaded[path] = (data, mime)
        repo.upload = upload
        def remove(paths):
            self.assertTrue(any(path.endswith('000001') for path in repo.uploaded))
            repo.removed.extend(paths)
        repo.remove = remove
        worker.process_job(repo, JOB)
        self.assertEqual(len(repo.removed), 2)
        self.assertTrue(all('.parts/' in path and JOB['lease_token'] in path for path in repo.removed))
        self.assertFalse(any(name == 'complete_video_processing' for name, _ in repo.calls))

    @patch.object(worker, 'PART_BYTES', 5)
    def test_lost_lease_stops_new_parts_and_waits_before_return(self):
        repo = FakeRepository()
        def upload(path, data, mime):
            time.sleep(0.35)
            repo.uploaded[path] = (data, mime)
        repo.upload = upload
        pulses = 0
        def pulse():
            nonlocal pulses
            pulses += 1
            if pulses > 1:
                raise worker.LostLease()
        attempted = []
        with self.assertRaises(worker.LostLease):
            worker.upload_parts(repo, io.BytesIO(b'x' * 25), 'attempt/manifest', worker.multipart_spec(25), attempted, pulse)
        self.assertEqual(len(attempted), 2)
        self.assertEqual(set(attempted), set(repo.uploaded))


class RemuxEligibilityTests(unittest.TestCase):
    def test_only_normalized_browser_compatible_streams_skip_encoding(self):
        video = {'codec_name':'h264', 'pix_fmt':'yuv420p', 'profile':'High', 'level':40,
                 'sample_aspect_ratio':'1:1', 'field_order':'progressive', 'width':1920, 'height':1080,
                 'audio':{'codec_name':'aac', 'profile':'LC', 'channels':2}}
        self.assertTrue(worker.can_remux(video))
        self.assertTrue(worker.can_remux({**video, 'audio':None}))
        for change in [{'codec_name':'hevc'}, {'pix_fmt':'yuv420p10le'}, {'profile':'High 4:4:4 Predictive'},
                       {'width':3840}, {'height':1081}, {'level':51}, {'sample_aspect_ratio':'2:1'},
                       {'sample_aspect_ratio':'N/A'}, {'field_order':'tt'}, {'tags':{'rotate':'90'}},
                       {'side_data_list':[{'rotation':90}]}, {'audio':{'codec_name':'pcm_s16le'}},
                       {'audio':{'codec_name':'aac', 'profile':'LC', 'channels':6}}]:
            with self.subTest(change=change):
                self.assertFalse(worker.can_remux({**video, **change}))


@unittest.skipUnless(shutil.which(os.getenv('FFMPEG_PATH', 'ffmpeg')) and shutil.which(os.getenv('FFPROBE_PATH', 'ffprobe')), 'FFmpeg binaries required')
class RealConversionTests(unittest.TestCase):
    def fixture(self, root, codec='mpeg4', size='160x120', audio=True, audio_codec='pcm_s16le'):
        source = root / 'source.mov'
        command = [os.getenv('FFMPEG_PATH', 'ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=12']
        if audio:
            command += ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100']
        command += ['-t', '0.6', '-c:v', codec, '-threads', '1']
        if audio:
            command += ['-c:a', audio_codec]
        subprocess.run([*command, str(source)], check=True, capture_output=True)
        return source

    def test_compatible_h264_aac_uses_copy_with_faststart_and_preserves_packets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root, codec='libx264', audio_codec='aac')
            original = source.read_bytes()
            output = root / 'playback.mp4'
            with patch.object(worker, 'run_process', wraps=worker.run_process) as run:
                metadata = worker.transcode(source, output, lambda: None, time.monotonic() + 60)
            commands = [call.args[0] for call in run.call_args_list]
            self.assertTrue(any('copy' in command for command in commands))
            self.assertFalse(any('libx264' in command for command in commands))
            self.assertEqual(metadata['audio']['codec_name'], 'aac')
            self.assertEqual(source.read_bytes(), original)
            content = output.read_bytes()
            self.assertLess(content.index(b'moov'), content.index(b'mdat'))
            def packet_hashes(path):
                data = json.loads(subprocess.check_output([os.getenv('FFPROBE_PATH', 'ffprobe'), '-v', 'error',
                    '-show_packets', '-show_data_hash', 'sha256', '-show_entries', 'packet=data_hash', '-of', 'json', str(path)]))
                return [packet['data_hash'] for packet in data['packets']]
            self.assertEqual(packet_hashes(source), packet_hashes(output))

    def test_rotation_requires_normalization_instead_of_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root, codec='libx264', audio=False)
            rotated = root / 'rotated.mov'
            subprocess.run([os.getenv('FFMPEG_PATH', 'ffmpeg'), '-v', 'error', '-y', '-display_rotation', '90', '-i', str(source),
                            '-c', 'copy', str(rotated)], check=True, capture_output=True)
            with patch.object(worker, 'run_process', wraps=worker.run_process) as run:
                result = worker.transcode(rotated, root / 'playback.mp4', lambda: None, time.monotonic() + 60)
            self.assertTrue(any('libx264' in call.args[0] for call in run.call_args_list))
            self.assertEqual((result['width'], result['height']), (120, 160))

    def test_failed_remux_falls_back_under_same_deadline(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root, codec='libx264', audio=False)
            original_run = worker.run_process
            def fail_copy(command, *args, **kwargs):
                if 'copy' in command:
                    raise worker.ConversionError('Container does not support this stream copy')
                return original_run(command, *args, **kwargs)
            with patch.object(worker, 'run_process', side_effect=fail_copy) as run:
                result = worker.transcode(source, root / 'playback.mp4', lambda: None, time.monotonic() + 60)
            self.assertTrue(any('copy' in call.args[0] for call in run.call_args_list))
            self.assertTrue(any('libx264' in call.args[0] for call in run.call_args_list))
            self.assertEqual(result['codec_name'], 'h264')

    def test_mov_becomes_h264_aac_faststart_original_unchanged(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root)
            original = source.read_bytes()
            output = root / 'playback.mp4'
            metadata = worker.transcode(source, output, lambda: None, time.monotonic() + 60)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual((metadata['codec_name'], metadata['pix_fmt']), ('h264', 'yuv420p'))
            data = json.loads(subprocess.check_output([os.getenv('FFPROBE_PATH', 'ffprobe'), '-v', 'error', '-show_streams', '-of', 'json', str(output)]))
            self.assertEqual(next(s['codec_name'] for s in data['streams'] if s['codec_type'] == 'audio'), 'aac')
            content = output.read_bytes()
            self.assertLess(content.index(b'moov'), content.index(b'mdat'))

    def test_hevc_portrait_without_audio(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root, codec='libx265', size='120x160', audio=False)
            result = worker.transcode(source, root / 'playback.mp4', lambda: None, time.monotonic() + 60)
            self.assertEqual((result['width'], result['height']), (120, 160))
            self.assertEqual(result['codec_name'], 'h264')

    def test_corrupt_input_fails_instead_of_publishing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'original.mov'
            source.write_bytes(b'not video')
            with self.assertRaises(worker.ConversionError):
                worker.transcode(source, root / 'playback.mp4', lambda: None, time.monotonic() + 60)
            self.assertEqual(source.read_bytes(), b'not video')

    def test_non_square_pixels_preserve_display_proportions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = self.fixture(root, audio=False)
            anamorphic = root / 'anamorphic.mov'
            subprocess.run([os.getenv('FFMPEG_PATH', 'ffmpeg'), '-v', 'error', '-y', '-i', str(source), '-vf', 'setsar=2/1', '-c:v', 'mpeg4', str(anamorphic)], check=True, capture_output=True)
            result = worker.transcode(anamorphic, root / 'playback.mp4', lambda: None, time.monotonic() + 60)
            self.assertAlmostEqual(result['width'] / result['height'], 320 / 120, places=2)


if __name__ == '__main__':
    unittest.main()
