from __future__ import annotations

from typing import Any

from supabase import Client, create_client

from .models import PdfJob


class SupabaseRepository:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.client: Client = create_client(url, service_role_key)

    def claim(self, worker_id: str, lease_seconds: int) -> PdfJob | None:
        response = self.client.rpc(
            "claim_pdf_processing_job_v2",
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
                "upsert": "false",
            },
        )

    def remove_pages(self, bucket_name: str, storage_paths: list[str]) -> None:
        if storage_paths:
            self.client.storage.from_(bucket_name).remove(storage_paths)

    @staticmethod
    def _accepted(response: Any) -> bool:
        if not isinstance(response.data, bool):
            raise RuntimeError("The PDF worker requires the v2 processing migration")
        return response.data

    def completed_by(self, job: PdfJob) -> bool:
        response = self.client.table("pdf_processing_jobs").select("status,lease_token").eq("id", job.id).execute()
        return any(row["status"] == "completed" and row["lease_token"] == job.lease_token
                   for row in response.data or [])

    def complete(self, job: PdfJob, pages: list[dict[str, Any]]) -> bool:
        return self._accepted(self.client.rpc(
            "complete_pdf_processing_job_v2",
            {
                "p_job_id": job.id,
                "p_lease_token": job.lease_token,
                "p_page_count": len(pages),
                "p_pages": pages,
            },
        ).execute())

    def report_progress(self, job: PdfJob, processed_pages: int, lease_seconds: int) -> bool:
        return self._accepted(self.client.rpc(
            "report_pdf_processing_progress_v2",
            {
                "p_job_id": job.id,
                "p_lease_token": job.lease_token,
                "p_processed_pages": processed_pages,
                "p_lease_seconds": lease_seconds,
            },
        ).execute())

    def fail(
        self,
        job: PdfJob,
        *,
        code: str,
        message: str,
        failed_page: int | None,
        retryable: bool,
    ) -> bool:
        return self._accepted(self.client.rpc(
            "fail_pdf_processing_job_v2",
            {
                "p_job_id": job.id,
                "p_lease_token": job.lease_token,
                "p_error_code": code,
                "p_error_message": message,
                "p_failed_page": failed_page,
                "p_is_retryable": retryable,
            },
        ).execute())
