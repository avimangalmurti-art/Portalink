"""Private original -> leased FFmpeg job -> verified H.264/AAC MP4 playback copy."""
from __future__ import annotations

import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import json
import logging
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.parse import quote

import httpx

LOG = logging.getLogger("portalink.video")
PART_BYTES = 40 * 1024 * 1024
SUFFIX = ".portalink-multipart.json"
FORMATS = "mov,matroska,webm,avi,mpegts,mpeg,mpegvideo,ogg"
UPLOAD_CONCURRENCY = 2


class ConversionError(Exception):
    def __init__(self, message: str, retryable: bool = False):
        super().__init__(message)
        self.retryable = retryable


class LostLease(Exception):
    pass


def multipart_spec(size: int) -> dict:
    return {"version": 1, "sizeBytes": size, "partBytes": PART_BYTES, "partCount": math.ceil(size / PART_BYTES)}


def part_path(path: str, index: int) -> str:
    return f"{path}.parts/{index:06d}"


def output_path(job: dict) -> str:
    return f"{job['source_path'].split('/')[0]}/video-previews/{job['project_id']}/{job['id']}/{job['lease_token']}/playback.mp4"


class Repository:
    def __init__(self, url: str, key: str):
        if not url.startswith("https://") or not url.rstrip("/").endswith(".supabase.co") or len(key) < 40:
            raise ValueError("Configure SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY")
        self.client = httpx.Client(base_url=url.rstrip("/"), headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=60, follow_redirects=False)

    def rpc(self, name: str, args: dict):
        response = self.client.post(f"/rest/v1/rpc/{name}", json=args)
        response.raise_for_status()
        return response.json()

    def claim(self):
        rows = self.rpc("claim_video_processing_job", {})
        return rows[0] if rows else None

    def owns_completed_output(self, job: dict, path: str) -> bool:
        response = self.client.get("/rest/v1/video_processing_jobs", params={"id": f"eq.{job['id']}", "select": "status,output_path,lease_token"})
        response.raise_for_status()
        return any(row["status"] == "completed" and row["output_path"] == path and row["lease_token"] == job["lease_token"] for row in response.json())

    def download(self, path: str, target, expected_size: int, pulse):
        size = 0
        with self.client.stream("GET", f"/storage/v1/object/authenticated/project-media/{quote(path, safe='/')}") as response:
            response.raise_for_status()
            for chunk in response.iter_bytes(1024 * 1024):
                pulse()
                size += len(chunk)
                if size > expected_size:
                    raise ConversionError("The stored video's size does not match its upload.")
                target.write(chunk)
        if size != expected_size:
            raise ConversionError("The stored video is incomplete.", retryable=True)

    def upload(self, path: str, data: bytes, mime: str):
        response = self.client.post(f"/storage/v1/object/project-media/{quote(path, safe='/')}", content=data,
                                    headers={"Content-Type": mime, "x-upsert": "false", "cache-control": "31536000"})
        response.raise_for_status()

    def remove(self, paths: list[str]):
        for offset in range(0, len(paths), 100):
            response = self.client.request("DELETE", "/storage/v1/object/project-media", json={"prefixes": paths[offset:offset + 100]})
            response.raise_for_status()


def run_process(command: list[str], directory: Path, pulse, deadline: float, *, probe=False):
    # Only local container formats are accepted. No playlists, URL fetching or shell interpolation.
    output = directory / ("probe.json" if probe else "ffmpeg.stdout")
    error = directory / "ffmpeg.stderr"
    with output.open("wb") as stdout, error.open("wb") as stderr:
        process = subprocess.Popen(command, cwd=directory, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr)
        try:
            while process.poll() is None:
                if time.monotonic() >= deadline:
                    raise ConversionError("Video conversion timed out. Try preparing it again.", retryable=True)
                pulse()
                time.sleep(0.25)
            if process.returncode:
                raise ConversionError("This video could not be decoded. Its original file is still available.")
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
    if probe:
        if output.stat().st_size > 1024 * 1024:
            raise ConversionError("The video's metadata could not be read.")
        return json.loads(output.read_text(encoding="utf-8"))


def probe_video(path: Path, directory: Path, pulse, deadline: float) -> dict:
    data = run_process([os.getenv("FFPROBE_PATH", "ffprobe"), "-v", "error", "-protocol_whitelist", "file,pipe",
                        "-format_whitelist", FORMATS, "-show_entries",
                        "stream=codec_type,codec_name,profile,level,width,height,pix_fmt,sample_aspect_ratio,field_order,channels:stream_tags=rotate:stream_side_data:format=duration",
                        "-of", "json", str(path)],
                       directory, pulse, deadline, probe=True)
    video = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "video"), None)
    duration = float(data.get("format", {}).get("duration", 0))
    if not video or not math.isfinite(duration) or duration <= 0 or video.get("width", 0) <= 0 or video.get("height", 0) <= 0:
        raise ConversionError("This file does not contain a readable video.")
    audio = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "audio"), None)
    return {**video, "duration": duration, "audio": audio}


def can_remux(metadata: dict) -> bool:
    """Copy only already-compatible streams that need no visual normalization."""
    audio = metadata.get("audio")
    return (
        metadata.get("codec_name") == "h264" and metadata.get("pix_fmt") == "yuv420p"
        and metadata.get("profile") in ("Constrained Baseline", "Baseline", "Main", "High")
        and 0 < metadata.get("level", 0) <= 42
        and metadata.get("sample_aspect_ratio") == "1:1"
        and metadata.get("field_order") == "progressive"
        and not metadata.get("side_data_list")
        and str(metadata.get("tags", {}).get("rotate", "0")) == "0"
        and all(0 < metadata.get(axis, 0) <= 1920 and metadata[axis] % 2 == 0 for axis in ("width", "height"))
        and (audio is None or (audio.get("codec_name") == "aac" and audio.get("profile") == "LC"
                               and 0 < audio.get("channels", 0) <= 2))
    )


def transcode(source: Path, destination: Path, pulse, deadline: float) -> dict:
    metadata = probe_video(source, source.parent, pulse, deadline)
    command = [os.getenv("FFMPEG_PATH", "ffmpeg"), "-nostdin", "-v", "error", "-y", "-max_alloc", "268435456",
                 "-protocol_whitelist", "file,pipe", "-format_whitelist", FORMATS, "-threads", "2", "-i", str(source),
                 "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1"]
    if can_remux(metadata):
        try:
            run_process([*command, "-c", "copy", "-movflags", "+faststart", str(destination)], source.parent, pulse, deadline)
            result = probe_video(destination, source.parent, pulse, deadline)
            if can_remux(result):
                # Stream-copy skips the decoder. Verify the copied packets too,
                # so damaged input does not become a nominally playable output.
                run_process([os.getenv("FFMPEG_PATH", "ffmpeg"), "-nostdin", "-v", "error", "-xerror",
                             "-max_alloc", "268435456", "-protocol_whitelist", "file,pipe", "-format_whitelist", FORMATS,
                             "-threads", "2", "-i", str(destination), "-map", "0:v:0", "-map", "0:a:0?",
                             "-f", "null", "-"], source.parent, pulse, deadline)
                return result
        except ConversionError:
            # A container/bitstream copy may fail despite a compatible probe.
            # Retry the established normalization path under the same deadline.
            pulse()
    run_process([*command,
                 "-vf", "scale=w='max(2,trunc(min(1920,min(1920*dar,iw*sar))/2)*2)':h='max(2,trunc(ow/dar/2)*2)',setsar=1",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-threads", "2",
                 "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", str(destination)], source.parent, pulse, deadline)
    result = probe_video(destination, source.parent, pulse, deadline)
    if (result["codec_name"] != "h264" or result["pix_fmt"] != "yuv420p"
            or (result["audio"] is not None and result["audio"]["codec_name"] != "aac")):
        raise ConversionError("The playable video copy could not be verified.", retryable=True)
    return result


def upload_parts(repository: Repository, file, destination: str, spec: dict, uploaded: list[str], pulse):
    # At most two 40 MiB buffers/requests are in flight. Only the main thread
    # heartbeats; all uploads drain before its caller can clean up an attempt.
    with ThreadPoolExecutor(max_workers=UPLOAD_CONCURRENCY) as executor:
        pending = set()
        index = 0
        while index < spec["partCount"] or pending:
            pulse()
            while index < spec["partCount"] and len(pending) < UPLOAD_CONCURRENCY:
                path = part_path(destination, index)
                data = file.read(PART_BYTES)
                uploaded.append(path)  # An uncertain response may still write.
                pending.add(executor.submit(repository.upload, path, data, "application/octet-stream"))
                del data
                index += 1
            completed, pending = wait(pending, timeout=0.25, return_when=FIRST_COMPLETED)
            for future in completed:
                future.result()
    pulse()
    # Publish the manifest only after every part has succeeded.
    uploaded.append(destination)
    repository.upload(destination, json.dumps(spec).encode(), "application/json")


def process_job(repository: Repository, job: dict):
    deadline = time.monotonic() + int(os.getenv("VIDEO_JOB_TIMEOUT_SECONDS", "3600"))
    last_heartbeat = 0.0
    uploaded: list[str] = []
    completion_attempted = False
    destination = output_path(job)

    def pulse():
        nonlocal last_heartbeat
        now = time.monotonic()
        if now >= deadline:
            raise ConversionError("Video conversion timed out.", retryable=True)
        if now - last_heartbeat >= 20:
            if not repository.rpc("heartbeat_video_processing", {"p_job_id": job["id"], "p_lease_token": job["lease_token"]}):
                raise LostLease()
            last_heartbeat = now

    try:
        pulse()
        with tempfile.TemporaryDirectory(prefix="portalink-video-") as temporary:
            directory = Path(temporary)
            if shutil.disk_usage(directory).free < int(job["source_size"]) * 3:
                raise ConversionError("The converter needs more temporary disk space. Please retry later.", retryable=True)
            source, output = directory / "original", directory / "playback.mp4"
            spec = job.get("source_multipart")
            with source.open("wb") as file:
                if spec:
                    if spec != multipart_spec(int(job["source_size"])) or not job["source_path"].endswith(SUFFIX):
                        raise ConversionError("The large video's upload metadata is invalid.")
                    for part in range(spec["partCount"]):
                        repository.download(part_path(job["source_path"], part), file, min(PART_BYTES, spec["sizeBytes"] - part * PART_BYTES), pulse)
                else:
                    repository.download(job["source_path"], file, int(job["source_size"]), pulse)
            metadata = transcode(source, output, pulse, deadline)
            size = output.stat().st_size
            output_spec = multipart_spec(size) if size > PART_BYTES else None
            if output_spec:
                destination += SUFFIX
            with output.open("rb") as file:
                if output_spec:
                    upload_parts(repository, file, destination, output_spec, uploaded, pulse)
                else:
                    uploaded.append(destination)
                    repository.upload(destination, file.read(), "video/mp4")
            pulse()
            completion_attempted = True
            complete = repository.rpc("complete_video_processing", {"p_job_id": job["id"], "p_lease_token": job["lease_token"],
                "p_output_path": destination, "p_width": metadata["width"], "p_height": metadata["height"], "p_duration": metadata["duration"],
                "p_size": size, "p_multipart": output_spec})
            if not complete:
                raise LostLease()
            LOG.info("Completed video job %s", job["id"])
    except Exception as error:
        # A completion response may be lost after the transaction commits. Never
        # delete a committed copy, or delete anything if its state cannot be checked.
        try:
            if repository.owns_completed_output(job, destination):
                return
            # A timed-out completion can still be in flight. An ordinary read
            # cannot prove it won't commit next; retain that attempt's files.
            if not completion_attempted:
                repository.remove(uploaded)
        except Exception:
            LOG.warning("Retained attempt output pending state verification for job %s", job["id"])
        if not isinstance(error, LostLease):
            message = str(error) if isinstance(error, ConversionError) else "The video converter could not finish. Please retry."
            retryable = error.retryable if isinstance(error, ConversionError) else True
            repository.rpc("fail_video_processing", {"p_job_id": job["id"], "p_lease_token": job["lease_token"], "p_message": message, "p_retryable": retryable})
        LOG.warning("Video job %s did not complete (%s)", job["id"], type(error).__name__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    for binary in (os.getenv("FFMPEG_PATH", "ffmpeg"), os.getenv("FFPROBE_PATH", "ffprobe")):
        if not shutil.which(binary):
            raise ValueError("FFmpeg and ffprobe must be installed on the worker")
    repository = Repository(os.getenv("SUPABASE_URL", ""), os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    while True:
        try:
            job = repository.claim()
            if job:
                process_job(repository, job)
            if args.once:
                return
            if not job:
                time.sleep(3)
        except Exception as error:
            LOG.error("Video worker connection unavailable (%s)", type(error).__name__)
            if args.once:
                raise SystemExit(1)
            time.sleep(15)


if __name__ == "__main__":
    main()
