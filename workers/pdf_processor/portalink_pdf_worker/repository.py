from __future__ import annotations

from typing import Any

from supabase import Client, create_client

from .models import PdfJob


class SupabaseRepository:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.client: Client = create_client(url, service_role_key)

    def claim(self, worker_id: str, lease_seconds: int) -> PdfJob | None:
        response = self.client.rpc(
            "claim_pdf_processing_job",
            {"p_worker_id": worker_id, "p_lease_seconds": lease_seconds},
        ).execute()
        rows = response.data or []
        return PdfJob.from_row(rows[0]) if rows else None

    def download_source(self, job: PdfJob) -> bytes:
        payload = self.client.storage.from_(job.source_bucket).download(job.source_path)
        return bytes(payload)

    def upload_page(self, bucket_name: str, storage_path: str, payload: bytes) -> None:
        self.client.storage.from_(bucket_name).upload(
            path=storage_path,
            file=payload,
            file_options={
                "content-type": "image/webp",
                "cache-control": "31536000",
                "upsert": "true",
            },
        )

    def remove_pages(self, bucket_name: str, storage_paths: list[str]) -> None:
        if storage_paths:
            self.client.storage.from_(bucket_name).remove(storage_paths)

    def complete(self, job_id: str, pages: list[dict[str, Any]]) -> None:
        self.client.rpc(
            "complete_pdf_processing_job",
            {
                "p_job_id": job_id,
                "p_page_count": len(pages),
                "p_pages": pages,
            },
        ).execute()

    def report_progress(self, job_id: str, processed_pages: int, lease_seconds: int) -> None:
        self.client.rpc(
            "report_pdf_processing_progress",
            {
                "p_job_id": job_id,
                "p_processed_pages": processed_pages,
                "p_lease_seconds": lease_seconds,
            },
        ).execute()

    def fail(
        self,
        job_id: str,
        *,
        code: str,
        message: str,
        failed_page: int | None,
        retryable: bool,
    ) -> None:
        self.client.rpc(
            "fail_pdf_processing_job",
            {
                "p_job_id": job_id,
                "p_error_code": code,
                "p_error_message": message,
                "p_failed_page": failed_page,
                "p_is_retryable": retryable,
            },
        ).execute()
