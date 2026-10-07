from __future__ import annotations

import gc
from pathlib import Path
import tempfile
import unittest

try:
    import pymupdf as fitz
except ImportError:
    import fitz  # type: ignore[no-redef]
from PIL import Image

from portalink_pdf_worker.config import MAX_PAGE_DIMENSION
from portalink_pdf_worker.models import PdfPipelineError
from portalink_pdf_worker.rendering import render_page_isolated, validate_pdf


class RenderingTests(unittest.TestCase):
    def test_renders_rgb_webp_with_bounded_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "wide.pdf"
            output = root / "page.webp"
            document = fitz.open()
            page = document.new_page(width=4000, height=1000)
            page.insert_text((100, 100), "Portalink PDF rendering")
            document.save(source)
            document.close()

            self.assertEqual(validate_pdf(source), 1)
            rendered = render_page_isolated(
                source,
                1,
                output,
                timeout_seconds=20,
                memory_limit_mb=1024,
            )

            with Image.open(output) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertEqual(image.mode, "RGB")
                self.assertLessEqual(max(image.size), MAX_PAGE_DIMENSION)
                self.assertEqual(image.size, (rendered.width, rendered.height))
                self.assertAlmostEqual(rendered.aspect_ratio, 4.0, places=2)

    def test_rejects_password_protected_pdf(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "locked.pdf"
            document = fitz.open()
            document.new_page()
            document.save(
                source,
                encryption=fitz.PDF_ENCRYPT_AES_256,
                owner_pw="owner-secret",
                user_pw="reader-secret",
            )
            document.close()

            with self.assertRaises(PdfPipelineError) as caught:
                validate_pdf(source)
            self.assertEqual(caught.exception.code, "password_protected_pdf")
            self.assertFalse(caught.exception.retryable)

    def test_rejects_corrupt_pdf(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "broken.pdf"
            source.write_bytes(b"%PDF-1.7\nnot actually a document")
            with self.assertRaises(PdfPipelineError) as caught:
                validate_pdf(source)
            self.assertEqual(caught.exception.code, "corrupted_pdf")
            self.assertFalse(caught.exception.retryable)
            # PyMuPDF's failed-open traceback can retain a native file handle
            # until collection on Windows. Release it before temp cleanup.
            del caught
            gc.collect()


if __name__ == "__main__":
    unittest.main()
