from __future__ import annotations

from pathlib import Path
import unittest
from typing import Any

try:
    import pymupdf as fitz
except ImportError:
    import fitz  # type: ignore[no-redef]

from portalink_pdf_worker.config import Settings
from portalink_pdf_worker.models import PdfJob
from portalink_pdf_worker.worker import page_storage_path, process_job


class FakeRepository:
    def __init__(self, source: bytes, *, fail_upload_index: int | None = None) -> None:
        self.source = source
        self.fail_upload_index = fail_upload_index
        self.uploaded: list[str] = []
        self.removals: list[list[str]] = []
        self.progress: list[int] = []
        self.completed_pages: list[dict[str, Any]] | None = None
        self.failure: dict[str, Any] | None = None

    def download_source(self, _job: PdfJob) -> bytes:
        return self.source

    def upload_page(self, _bucket: str, path: str, _payload: bytes) -> None:
        page_index = int(Path(path).stem.split("_")[-1])
        if page_index == self.fail_upload_index:
            raise RuntimeError("simulated storage failure")
        self.uploaded.append(path)

    def remove_pages(self, _bucket: str, paths: list[str]) -> None:
        self.removals.append(list(paths))

    def report_progress(self, _job_id: str, pages: int, _lease: int) -> None:
        self.progress.append(pages)

    def complete(self, _job_id: str, pages: list[dict[str, Any]]) -> None:
        self.completed_pages = pages

    def fail(self, _job_id: str, **failure: Any) -> None:
        self.failure = failure


def make_pdf(page_count: int) -> bytes:
    document = fitz.open()
    for index in range(page_count):
        page = document.new_page(width=612, height=792)
        page.insert_text((72, 72), f"Portalink page {index + 1}")
    payload = document.tobytes()
    document.close()
    return payload


class WorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = Settings(
            supabase_url="https://example.supabase.co",
            supabase_service_role_key="x" * 64,
            page_timeout_seconds=20,
            page_memory_limit_mb=1024,
        )
        self.job = PdfJob(
            id="10000000-0000-0000-0000-000000000001",
            post_id="20000000-0000-0000-0000-000000000002",
            attachment_id="profile/draft/source.pdf",
            source_bucket="project-media",
            source_path="profile/draft/source.pdf",
            page_offset=3,
            attempt_count=1,
        )

    def test_completes_with_standard_global_page_names(self) -> None:
        repository = FakeRepository(make_pdf(2))
        process_job(repository, self.settings, self.job)  # type: ignore[arg-type]

        expected = [
            page_storage_path(self.job.post_id, 4),
            page_storage_path(self.job.post_id, 5),
        ]
        self.assertEqual(repository.uploaded, expected)
        self.assertEqual(repository.progress, [1, 2])
        self.assertIsNone(repository.failure)
        self.assertEqual(
            [page["storagePath"] for page in repository.completed_pages or []],
            expected,
        )

    def test_page_upload_failure_rolls_back_and_names_failed_page(self) -> None:
        repository = FakeRepository(make_pdf(2), fail_upload_index=5)
        process_job(repository, self.settings, self.job)  # type: ignore[arg-type]

        first_page = page_storage_path(self.job.post_id, 4)
        self.assertEqual(repository.uploaded, [first_page])
        self.assertEqual(repository.removals[-1], [first_page])
        self.assertIsNone(repository.completed_pages)
        self.assertEqual(repository.failure and repository.failure["code"], "page_upload_failed")
        self.assertEqual(repository.failure and repository.failure["failed_page"], 2)
        self.assertTrue(repository.failure and repository.failure["retryable"])


if __name__ == "__main__":
    unittest.main()
