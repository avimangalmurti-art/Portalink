from __future__ import annotations

import logging
from pathlib import Path
import tempfile
import time

from .config import Settings
from .models import PdfJob, PdfPipelineError
from .rendering import ensure_within_job_deadline, render_page_isolated, validate_pdf
from .repository import SupabaseRepository


LOGGER = logging.getLogger(__name__)
PAGE_BUCKET = "project-media"


def page_storage_path(job: PdfJob, page_index: int) -> str:
    return f"posts/{job.post_id}/pages/{job.id}/{job.lease_token}/page_{page_index}.webp"


class LostLease(Exception):
    pass


def process_job(repository: SupabaseRepository, settings: Settings, job: PdfJob) -> None:
    """Process one fenced attempt; never delete an uncertain completion's pages."""
    deadline = time.monotonic() + settings.job_timeout_seconds
    uploaded_paths: list[str] = []
    completion_attempted = False

    def progress(page_number: int) -> None:
        if not repository.report_progress(job, page_number, settings.lease_seconds):
            raise LostLease()

    try:
        progress(0)
        source = repository.download_source(job)

        with tempfile.TemporaryDirectory(prefix="portalink-pdf-") as directory:
            work_dir = Path(directory)
            source_path = work_dir / "source.pdf"
            source_path.write_bytes(source)
            del source
            page_count = validate_pdf(source_path)
            ensure_within_job_deadline(deadline, 1)
            progress(0)

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
                storage_path = page_storage_path(job, storage_index)
                try:
                    # A lost upload response can still have written this object.
                    # Every path belongs only to this attempt, never a successor.
                    uploaded_paths.append(storage_path)
                    repository.upload_page(PAGE_BUCKET, storage_path, local_path.read_bytes())
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
                    progress(page_number)
                except LostLease:
                    raise
                except Exception as error:
                    raise PdfPipelineError(
                        "progress_update_failed",
                        f"Processing stopped after page {page_number} because its durable progress could not be saved.",
                        retryable=True,
                        failed_page=page_number,
                    ) from error

            ensure_within_job_deadline(deadline, page_count)
            completion_attempted = True
            if not repository.complete(job, pages):
                raise LostLease()
            LOGGER.info(
                "Completed PDF job %s for post %s (%d pages)",
                job.id,
                job.post_id,
                page_count,
            )
    except LostLease:
        # The attempt is no longer authoritative. Immutable paths ensure that a
        # later attempt can proceed without being overwritten by this worker.
        LOGGER.warning("PDF job %s lost its lease; leaving state and output unchanged", job.id)
    except Exception as error:
        if completion_attempted:
            # The transaction may have committed even when the HTTP response was
            # lost. A negative read cannot prove an in-flight commit won't finish.
            try:
                if repository.completed_by(job):
                    LOGGER.info("Confirmed completed PDF job %s after a lost response", job.id)
                    return
            except Exception:
                LOGGER.exception("Could not resolve completion for PDF job %s", job.id)
            LOGGER.warning("PDF job %s has uncertain completion; retaining its pages for lease recovery", job.id)
            return
        if isinstance(error, PdfPipelineError):
            _rollback_and_fail(repository, job, uploaded_paths, error)
            return
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
    # Fence the failure before cleanup. If the response is uncertain or the
    # attempt no longer owns the job, retain files: a completed attempt wins.
    try:
        accepted = repository.fail(
            job,
            code=error.code,
            message=str(error),
            failed_page=error.failed_page,
            retryable=error.retryable,
        )
    except Exception:
        LOGGER.exception("Could not persist failure state for PDF job %s; retaining attempt pages", job.id)
        return
    if not accepted:
        LOGGER.warning("PDF job %s no longer owns its lease; retaining attempt pages", job.id)
        return
    try:
        repository.remove_pages(PAGE_BUCKET, uploaded_paths)
    except Exception:
        LOGGER.exception("Could not remove partial pages for PDF job %s; storage cleanup remains", job.id)

    if cause:
        LOGGER.error("PDF job %s failed: %s (cause: %r)", job.id, error, cause)
    else:
        LOGGER.warning("PDF job %s failed: %s", job.id, error)
