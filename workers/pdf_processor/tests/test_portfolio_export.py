import io
import unittest
from PIL import Image
try:
    import pymupdf as fitz
except ImportError:
    import fitz
from portalink_pdf_worker.portfolio_export import render_portfolio, public_cover

class PortfolioExportTests(unittest.TestCase):
    def test_sixteen_projects_keep_each_cover_title_date_portal_summary_and_citation(self):
        image = io.BytesIO()
        Image.new('RGB', (300, 200), '#aaccee').save(image, format='JPEG')
        projects = [{'id': str(i), 'title': f'Project {i:02}', 'portal': 'Design', 'made_on': '2024-01-02', 'summary': f'One-line summary {i:02}', 'citation_url': f'https://portalink.example/cite/page-{i}', 'cover_url': f'https://supabase.example/cover-{i}'} for i in range(16)]
        seen = []
        result = render_portfolio({'name': 'Åda Example', 'handle': 'ada', 'generated_at': '2026-10-12T12:00:00Z', 'projects': projects}, lambda url: seen.append(url) or image.getvalue())
        self.assertTrue(result.startswith(b'%PDF-'))
        document = fitz.open(stream=result, filetype='pdf')
        text = ''.join(page.get_text() for page in document)
        self.assertIn('Åda Example', text)
        self.assertIn('@ada', text)
        self.assertIn('2026-10-12', text)
        for project in projects:
            self.assertIn(project['title'], text)
            self.assertIn(project['summary'], text)
            self.assertIn(project['citation_url'], text)
        self.assertEqual(len(seen), 16)
        self.assertEqual(sum(len(page.get_links()) for page in document), 16)
        self.assertGreater(document.page_count, 1)
        document.close()

    def test_empty_journey_and_absent_cover_are_explicit(self):
        for projects in [[], [{'id': '1', 'title': 'No cover', 'portal': 'Art', 'made_on': '', 'summary': 'Summary', 'citation_url': 'https://site.example/p/1', 'cover_url': None}]]:
            result = render_portfolio({'name': 'Creator', 'handle': 'creator', 'generated_at': '2026-10-12T00:00:00Z', 'projects': projects})
            with fitz.open(stream=result, filetype='pdf') as document:
                text = ''.join(page.get_text() for page in document)
                self.assertIn('Cover unavailable' if projects else 'No public projects.', text)

    def test_private_or_untrusted_cover_urls_never_fetch(self):
        for url in ['http://127.0.0.1/a', 'https://other.example/storage/v1/object/public/project-covers/a', 'https://supabase.example/storage/v1/object/authenticated/project-media/a']:
            self.assertIsNone(public_cover(url, 'https://supabase.example'))
