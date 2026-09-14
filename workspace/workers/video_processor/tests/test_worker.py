import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
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
        paths = list(repo.uploaded)
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


@unittest.skipUnless(shutil.which(os.getenv('FFMPEG_PATH', 'ffmpeg')) and shutil.which(os.getenv('FFPROBE_PATH', 'ffprobe')), 'FFmpeg binaries required')
class RealConversionTests(unittest.TestCase):
    def fixture(self, root, codec='mpeg4', size='160x120', audio=True):
        source = root / 'source.mov'
        command = [os.getenv('FFMPEG_PATH', 'ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', f'testsrc2=size={size}:rate=12']
        if audio:
            command += ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100']
        command += ['-t', '0.6', '-c:v', codec, '-threads', '1']
        if audio:
            command += ['-c:a', 'pcm_s16le']
        subprocess.run([*command, str(source)], check=True, capture_output=True)
        return source

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
