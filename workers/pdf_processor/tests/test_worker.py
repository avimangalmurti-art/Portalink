from __future__ import annotations

from pathlib import Path
from dataclasses import replace
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
    def __init__(self, source: bytes, *, fail_upload_index: int | None = None,
                 completion: str = "success", lose_lease: bool = False,
                 fail_response_lost: bool = False) -> None:
        self.source = source
        self.fail_upload_index = fail_upload_index
        self.uploaded: list[str] = []
        self.removals: list[list[str]] = []
        self.progress: list[int] = []
        self.completed_pages: list[dict[str, Any]] | None = None
        self.failure: dict[str, Any] | None = None
        self.completion = completion
        self.lose_lease = lose_lease
        self.fail_response_lost = fail_response_lost
        self.events: list[str] = []

    def download_source(self, _job: PdfJob) -> bytes:
        return self.source

    def upload_page(self, _bucket: str, path: str, _payload: bytes) -> None:
        page_index = int(Path(path).stem.split("_")[-1])
        if page_index == self.fail_upload_index:
            raise RuntimeError("simulated storage failure")
        self.uploaded.append(path)

    def remove_pages(self, _bucket: str, paths: list[str]) -> None:
        self.events.append("cleanup")
        self.removals.append(list(paths))

    def report_progress(self, _job: PdfJob, pages: int, _lease: int) -> bool:
        self.progress.append(pages)
        return not (self.lose_lease and pages > 0)

    def complete(self, _job: PdfJob, pages: list[dict[str, Any]]) -> bool:
        if self.completion in ("success", "committed_response_lost"):
            self.completed_pages = pages
        if self.completion == "lost_lease":
            return False
        if self.completion != "success":
            raise TimeoutError("simulated completion response loss")
        return True

    def completed_by(self, _job: PdfJob) -> bool:
        if self.completion == "unavailable":
            raise TimeoutError("simulated status unavailable")
        return self.completed_pages is not None

    def fail(self, _job: PdfJob, **failure: Any) -> bool:
        self.events.append("fail")
        if self.fail_response_lost:
            raise TimeoutError("simulated failure response loss")
        if self.lose_lease:
            return False
        self.failure = failure
        return True


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
            lease_token="30000000-0000-0000-0000-000000000003",
        )

    def test_completes_with_immutable_attempt_paths_and_global_indexes(self) -> None:
        repository = FakeRepository(make_pdf(2))
        process_job(repository, self.settings, self.job)  # type: ignore[arg-type]

        expected = [
            page_storage_path(self.job, 4),
            page_storage_path(self.job, 5),
        ]
        self.assertEqual(repository.uploaded, expected)
        self.assertEqual(repository.progress, [0, 0, 1, 2])
        self.assertEqual(repository.removals, [])
        self.assertIsNone(repository.failure)
        self.assertEqual(
            [page["storagePath"] for page in repository.completed_pages or []],
            expected,
        )

    def test_page_upload_failure_rolls_back_and_names_failed_page(self) -> None:
        repository = FakeRepository(make_pdf(2), fail_upload_index=5)
        process_job(repository, self.settings, self.job)  # type: ignore[arg-type]

        first_page = page_storage_path(self.job, 4)
        self.assertEqual(repository.uploaded, [first_page])
        self.assertEqual(repository.removals[-1], [first_page, page_storage_path(self.job, 5)])
        self.assertEqual(repository.events, ["fail", "cleanup"])
        self.assertIsNone(repository.completed_pages)
        self.assertEqual(repository.failure and repository.failure["code"], "page_upload_failed")
        self.assertEqual(repository.failure and repository.failure["failed_page"], 2)
        self.assertTrue(repository.failure and repository.failure["retryable"])

    def test_lost_completion_response_preserves_committed_pages(self) -> None:
        repository = FakeRepository(make_pdf(1), completion="committed_response_lost")
        process_job(repository, self.settings, self.job)  # type: ignore[arg-type]
        self.assertIsNotNone(repository.completed_pages)
        self.assertEqual(repository.removals, [])
        self.assertIsNone(repository.failure)

    def test_uncertain_completion_never_cleans_up_even_when_not_yet_committed(self) -> None:
        for outcome in ("not_yet_committed", "unavailable"):
            with self.subTest(outcome=outcome):
                repository = FakeRepository(make_pdf(1), completion=outcome)
                process_job(repository, self.settings, self.job)  # type: ignore[arg-type]
                self.assertEqual(len(repository.uploaded), 1)
                self.assertEqual(repository.removals, [])
                self.assertIsNone(repository.failure)

    def test_lost_lease_cannot_fail_or_remove_a_successor_attempt(self) -> None:
        for repository in (FakeRepository(make_pdf(1), lose_lease=True),
                           FakeRepository(make_pdf(1), completion="lost_lease")):
            process_job(repository, self.settings, self.job)  # type: ignore[arg-type]
            self.assertIsNone(repository.failure)
            self.assertEqual(repository.removals, [])
        successor = replace(self.job, lease_token="40000000-0000-0000-0000-000000000004")
        self.assertNotEqual(page_storage_path(self.job, 4), page_storage_path(successor, 4))

    def test_uncertain_failure_response_retains_attempt_pages(self) -> None:
        repository = FakeRepository(make_pdf(2), fail_upload_index=5, fail_response_lost=True)
        process_job(repository, self.settings, self.job)  # type: ignore[arg-type]
        self.assertEqual(repository.removals, [])
        self.assertEqual(repository.events, ["fail"])


if __name__ == "__main__":
    unittest.main()
