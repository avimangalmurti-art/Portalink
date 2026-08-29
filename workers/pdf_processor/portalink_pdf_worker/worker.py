from __future__ import annotations

import logging
from pathlib import Path
import tempfile
import time

from .config import MAX_PDF_BYTES, Settings
from .models import PdfJob, PdfPipelineError
from .rendering import ensure_within_job_deadline, render_page_isolated, validate_pdf
from .repository import SupabaseRepository


LOGGER = logging.getLogger(__name__)
PAGE_BUCKET = "project-media"


def page_storage_path(post_id: str, page_index: int) -> str:
    return f"posts/{post_id}/pages/page_{page_index}.webp"


def process_job(repository: SupabaseRepository, settings: Settings, job: PdfJob) -> None:
    """Process one claimed job, rolling back every page if any step fails."""
    deadline = time.monotonic() + settings.job_timeout_seconds
    uploaded_paths: list[str] = []

    try:
        source = repository.download_source(job)
        if len(source) > MAX_PDF_BYTES:
            raise PdfPipelineError(
                "pdf_too_large",
                "PDF files must be 50 MB or smaller.",
                retryable=False,
            )

        with tempfile.TemporaryDirectory(prefix="portalink-pdf-") as directory:
            work_dir = Path(directory)
            source_path = work_dir / "source.pdf"
            source_path.write_bytes(source)
            del source
            page_count = validate_pdf(source_path)

            # Remove objects a crashed prior attempt may have left. Because jobs
            # for one post are serial, no later PDF can own this page range yet.
            expected_paths = [
                page_storage_path(job.post_id, job.page_offset + page_number)
                for page_number in range(1, page_count + 1)
            ]
            repository.remove_pages(PAGE_BUCKET, expected_paths)

            pages: list[dict[str, object]] = []
            for page_number in range(1, page_count + 1):
                ensure_within_job_deadline(deadline, page_number)
                local_path = work_dir / f"page_{page_number}.webp"
                rendered = render_page_isolated(
                    source_path,
                    page_number,
                    local_path,
                    timeout_seconds=min(
                        settings.page_timeout_seconds,
                        max(1, int(deadline - time.monotonic())),
                    ),
                    memory_limit_mb=settings.page_memory_limit_mb,
                )
                storage_index = job.page_offset + page_number
                storage_path = page_storage_path(job.post_id, storage_index)
                try:
                    repository.upload_page(PAGE_BUCKET, storage_path, local_path.read_bytes())
                    uploaded_paths.append(storage_path)
                except Exception as error:
                    raise PdfPipelineError(
                        "page_upload_failed",
                        f"Page {page_number} was rendered but could not be stored.",
                        retryable=True,
                        failed_page=page_number,
                    ) from error
                pages.append({
                    "index": storage_index,
                    "withinDocumentIndex": rendered.within_document_index,
                    "attachmentId": job.attachment_id,
                    "storagePath": storage_path,
                    "width": rendered.width,
                    "height": rendered.height,
                    "aspectRatio": rendered.aspect_ratio,
                })
                try:
                    repository.report_progress(job.id, page_number, settings.lease_seconds)
                except Exception as error:
                    raise PdfPipelineError(
                        "progress_update_failed",
                        f"Processing stopped after page {page_number} because its durable progress could not be saved.",
                        retryable=True,
                        failed_page=page_number,
                    ) from error

            ensure_within_job_deadline(deadline, page_count)
            repository.complete(job.id, pages)
            LOGGER.info(
                "Completed PDF job %s for post %s (%d pages)",
                job.id,
                job.post_id,
                page_count,
            )
    except PdfPipelineError as error:
        _rollback_and_fail(repository, job, uploaded_paths, error)
    except Exception as error:
        LOGGER.exception("Unexpected failure in PDF job %s", job.id)
        wrapped = PdfPipelineError(
            "processing_service_error",
            "The PDF preview could not be prepared because the processing service failed.",
            retryable=True,
        )
        _rollback_and_fail(repository, job, uploaded_paths, wrapped, cause=error)


def _rollback_and_fail(
    repository: SupabaseRepository,
    job: PdfJob,
    uploaded_paths: list[str],
    error: PdfPipelineError,
    *,
    cause: Exception | None = None,
) -> None:
    cleanup_suffix = ""
    try:
        repository.remove_pages(PAGE_BUCKET, uploaded_paths)
    except Exception:
        LOGGER.exception("Could not remove partial pages for PDF job %s", job.id)
        cleanup_suffix = " Some partial page objects may still require storage cleanup."

    message = f"{error}{cleanup_suffix}"
    try:
        repository.fail(
            job.id,
            code=error.code,
            message=message,
            failed_page=error.failed_page,
            retryable=error.retryable,
        )
    except Exception:
        LOGGER.exception("Could not persist failure state for PDF job %s", job.id)
        raise

    if cause:
        LOGGER.error("PDF job %s failed: %s (cause: %r)", job.id, message, cause)
    else:
        LOGGER.warning("PDF job %s failed: %s", job.id, message)
