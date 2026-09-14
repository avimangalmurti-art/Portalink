from __future__ import annotations

import math
import multiprocessing
from pathlib import Path
import queue
import time
from typing import Any

try:
    import pymupdf as fitz
except ImportError:  # PyMuPDF < 1.24 keeps the historical module name.
    import fitz  # type: ignore[no-redef]
from PIL import Image

from .config import MAX_PAGE_DIMENSION, RENDER_DPI, WEBP_QUALITY
from .models import PdfPipelineError, RenderedPage


def validate_pdf(source_path: Path) -> int:
    """Validate the source without rendering the entire document into memory."""
    if source_path.stat().st_size <= 0:
        raise PdfPipelineError("empty_pdf", "The PDF file is empty.", retryable=False)

    with source_path.open("rb") as source:
        if b"%PDF-" not in source.read(1024):
            raise PdfPipelineError(
                "invalid_pdf_signature",
                "The uploaded file is not a valid PDF.",
                retryable=False,
            )

    try:
        # Open from disk so validation does not duplicate a large source file in
        # memory. Page rendering reopens the same temporary file in an isolated
        # child process with its own memory and time limits.
        document = fitz.open(source_path)
    except Exception as error:
        raise PdfPipelineError(
            "corrupted_pdf",
            "The PDF is corrupted or cannot be read.",
            retryable=False,
        ) from error

    try:
        if document.needs_pass:
            raise PdfPipelineError(
                "password_protected_pdf",
                "Password-protected PDFs cannot be processed. Upload an unlocked copy.",
                retryable=False,
            )
        if document.page_count < 1:
            raise PdfPipelineError(
                "empty_pdf",
                "The PDF does not contain any pages.",
                retryable=False,
            )
        return int(document.page_count)
    finally:
        document.close()


def _apply_child_limits(memory_limit_mb: int, timeout_seconds: int) -> None:
    """Apply hard Linux limits; parent-process timeouts remain portable."""
    try:
        import resource
    except ImportError:
        return

    memory_bytes = memory_limit_mb * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    cpu_seconds = max(2, math.ceil(timeout_seconds))
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 1))


def _render_page(
    source_path: str,
    page_index: int,
    output_path: str,
) -> dict[str, int]:
    document = fitz.open(source_path)
    try:
        page = document.load_page(page_index)
        rect = page.rect
        if rect.width <= 0 or rect.height <= 0:
            raise ValueError("page has invalid dimensions")

        high_resolution_scale = RENDER_DPI / 72.0
        dimension_scale = min(
            MAX_PAGE_DIMENSION / float(rect.width),
            MAX_PAGE_DIMENSION / float(rect.height),
        )
        scale = min(high_resolution_scale, dimension_scale)
        if not math.isfinite(scale) or scale <= 0:
            raise ValueError("page scale is invalid")

        pixmap = page.get_pixmap(
            matrix=fitz.Matrix(scale, scale),
            colorspace=fitz.csRGB,
            alpha=False,
        )
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        if image.width > MAX_PAGE_DIMENSION or image.height > MAX_PAGE_DIMENSION:
            image.thumbnail((MAX_PAGE_DIMENSION, MAX_PAGE_DIMENSION), Image.Resampling.LANCZOS)
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.save(
            output_path,
            format="WEBP",
            quality=WEBP_QUALITY,
            method=6,
            optimize=True,
        )
        return {"width": image.width, "height": image.height}
    finally:
        document.close()


def _render_page_process(
    source_path: str,
    page_index: int,
    output_path: str,
    result_queue: Any,
    memory_limit_mb: int,
    timeout_seconds: int,
) -> None:
    try:
        _apply_child_limits(memory_limit_mb, timeout_seconds)
        result_queue.put({"ok": True, **_render_page(source_path, page_index, output_path)})
    except BaseException as error:
        result_queue.put({
            "ok": False,
            "message": str(error) or error.__class__.__name__,
        })


def render_page_isolated(
    source_path: Path,
    page_number: int,
    output_path: Path,
    *,
    timeout_seconds: int,
    memory_limit_mb: int,
) -> RenderedPage:
    """Render one page in a killable child so a hostile page cannot hold the job."""
    context = multiprocessing.get_context("spawn")
    result_queue = context.Queue(maxsize=1)
    process = context.Process(
        target=_render_page_process,
        args=(
            str(source_path),
            page_number - 1,
            str(output_path),
            result_queue,
            memory_limit_mb,
            timeout_seconds,
        ),
        daemon=True,
    )
    process.start()
    process.join(timeout_seconds)

    if process.is_alive():
        process.terminate()
        process.join(5)
        if process.is_alive():
            process.kill()
            process.join(2)
        raise PdfPipelineError(
            "page_timeout",
            f"Page {page_number} took too long to render.",
            retryable=True,
            failed_page=page_number,
        )

    try:
        result = result_queue.get(timeout=1)
    except queue.Empty as error:
        raise PdfPipelineError(
            "page_memory_limit" if process.exitcode else "page_conversion_failed",
            f"Page {page_number} could not be rendered within the worker limits.",
            retryable=True,
            failed_page=page_number,
        ) from error
    finally:
        result_queue.close()

    if not result.get("ok"):
        raise PdfPipelineError(
            "page_conversion_failed",
            f"Page {page_number} could not be converted: {result.get('message', 'unknown rendering error')}",
            retryable=True,
            failed_page=page_number,
        )

    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise PdfPipelineError(
            "page_conversion_failed",
            f"Page {page_number} did not produce an image.",
            retryable=True,
            failed_page=page_number,
        )

    return RenderedPage(
        within_document_index=page_number,
        width=int(result["width"]),
        height=int(result["height"]),
        output_path=str(output_path),
    )


def ensure_within_job_deadline(deadline: float, page_number: int) -> None:
    if time.monotonic() >= deadline:
        raise PdfPipelineError(
            "job_timeout",
            f"PDF processing reached its time limit before page {page_number}.",
            retryable=True,
            failed_page=page_number,
        )
