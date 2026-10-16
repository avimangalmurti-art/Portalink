"""Public Timeline export using the existing PyMuPDF renderer. No queue writes."""
from __future__ import annotations

import io
import json
import os
import secrets
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from threading import BoundedSemaphore

try:
    import pymupdf as fitz
except ImportError:
    import fitz
from PIL import Image

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def public_cover(url: str, supabase_origin: str) -> bytes | None:
    """Only the configured Storage host, public covers or anonymous signed media.
    No caller auth, service-role key, arbitrary URL or redirects are forwarded.
    """
    target, origin = urlsplit(url), urlsplit(supabase_origin)
    if target.scheme != 'https' or target.netloc != origin.netloc or target.username or target.password or target.fragment:
        return None
    if not target.path.startswith(('/storage/v1/object/public/project-covers/', '/storage/v1/object/sign/project-media/')):
        return None
    try:
        with build_opener(NoRedirect()).open(Request(url, headers={'Accept': 'image/*'}), timeout=5) as response:
            if not response.headers.get('Content-Type', '').startswith('image/'):
                return None
            image_bytes = response.read(2 * 1024 * 1024 + 1)
            if len(image_bytes) > 2 * 1024 * 1024:
                return None
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.thumbnail((1200, 1200))
            output = io.BytesIO()
            image.convert('RGB').save(output, format='JPEG', quality=85)
            return output.getvalue()
    except Exception:
        return None

def render_portfolio(document: dict, cover_loader=None) -> bytes:
    if not isinstance(document, dict) or not isinstance(document.get('projects'), list):
        raise ValueError('Invalid portfolio')
    if len(document['projects']) > 10000:
        raise ValueError('Portfolio exceeds export capacity')
    pdf = fitz.open()
    started = time.monotonic()
    # Embedded Unicode-capable font, rather than losing names/handles to ASCII.
    font = fitz.Font('cjk')
    generated = datetime.fromisoformat(document['generated_at'].replace('Z', '+00:00')).date().isoformat()
    def text(page, value, x, y, size=11, width=515):
        while True:
            writer = fitz.TextWriter(page.rect)
            result = writer.fill_textbox(fitz.Rect(x, y, x + width, y + 80), str(value), font=font, fontsize=size)
            if not result:
                break
            size -= 1
            if size < 8:
                raise ValueError('Text exceeds export layout')
        writer.write_text(page)
    page = pdf.new_page(width=595, height=842)
    text(page, document.get('name', ''), 40, 38, 25)
    text(page, '@' + document.get('handle', '').lstrip('@'), 40, 84, 13)
    text(page, 'Timeline · ' + generated, 40, 110, 11)
    y = 162
    if not document['projects']:
        text(page, 'No public projects.', 40, y)
    for project in document['projects']:
        if time.monotonic() - started > 45:
            raise TimeoutError('Portfolio export deadline exceeded')
        if y + 245 > 785:
            page = pdf.new_page(width=595, height=842)
            text(page, document.get('name', '') + ' · Timeline', 40, 30, 12)
            y = 65
        cover_rect = fitz.Rect(40, y, 200, y + 132)
        cover = cover_loader(project['cover_url']) if cover_loader and project.get('cover_url') and time.monotonic() - started < 25 else None
        if cover:
            page.insert_image(cover_rect, stream=cover, keep_proportion=True)
        else:
            page.draw_rect(cover_rect, color=(.85,.85,.85), fill=(.96,.96,.96))
            text(page, 'Cover unavailable', 50, y + 58, 10, 140)
        text(page, project.get('title', '')[:500], 216, y, 16, 339)
        text(page, project.get('portal', '')[:200], 216, y + 83, 11, 339)
        text(page, 'Made on · ' + (project.get('made_on') or 'Date not set'), 216, y + 110, 11, 339)
        summary = project.get('summary', '')[:500]
        # Keep the requested summary to one printed line, with an honest ellipsis.
        if font.text_length(summary, fontsize=11) > 515:
            while summary and font.text_length(summary + '…', fontsize=11) > 515:
                summary = summary[:-1]
            summary = summary.rstrip() + '…'
        text(page, summary, 40, y + 145, 11)
        citation = project.get('citation_url', '')
        text(page, citation, 40, y + 195, 9)
        if citation.startswith('https://'):
            page.insert_link({'kind': fitz.LINK_URI, 'from': fitz.Rect(40, y + 192, 555, y + 227), 'uri': citation})
        y += 245
    for index, page in enumerate(pdf):
        text(page, f'{generated} · {index + 1} / {pdf.page_count}', 40, 808, 9)
    pdf.set_metadata({'title': document.get('name', '') + ' — Portalink Timeline', 'author': document.get('name', ''), 'subject': 'Public work only; generated ' + generated})
    result = pdf.tobytes(garbage=4, deflate=True)
    pdf.close()
    return result

def serve_exports() -> None:
    secret = os.environ.get('PORTFOLIO_PDF_WORKER_SECRET', '')
    origin = os.environ.get('SUPABASE_URL', '')
    if not secret or not origin:
        raise ValueError('PORTFOLIO_PDF_WORKER_SECRET and SUPABASE_URL are required')
    capacity = BoundedSemaphore(2)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # Never log auth headers, signed URLs or account/project content.
        def do_POST(self):
            if self.path != '/export' or not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
                self.send_error(404)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                self.send_error(400)
                return
            if not 0 < length <= 8 * 1024 * 1024:
                self.send_error(413)
                return
            if not capacity.acquire(blocking=False):
                self.send_error(503)
                return
            try:
                document = json.loads(self.rfile.read(length))
                output = render_portfolio(document, lambda url: public_cover(url, origin))
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(output)))
                self.end_headers()
                self.wfile.write(output)
            except Exception:
                self.send_error(503, 'Portfolio export unavailable')
            finally:
                capacity.release()
    ThreadingHTTPServer((os.environ.get('PDF_EXPORT_BIND', '127.0.0.1'), int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
