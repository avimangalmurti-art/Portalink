# Legal document sources

All four Markdown files are placeholders marked `[DRAFT — not yet reviewed by counsel]`. These are the initial version 1.0 sources for the pending SQL. Edit them for legal review, then run `node.exe scripts/prepare-legal-migration.mjs` to regenerate only `supabase/pending/legal_documents_and_acceptances.sql`. The command does not connect to or modify a database.

The supported renderer escapes HTML and supports paragraphs, headings, bullets, bold and HTTPS/root links. Content Licence must retain the `## Private`, `## Public`, and `## Citable` headings: its plain-English card is extracted from these sections, so sheet, public page and MCP adapter share the same wording.

After a version has been accepted, preserve it. Insert a new numeric version and effective date through a separately reviewed migration rather than rewriting history. The app selects each document's latest effective version and compares it with that user's recorded acceptance. Future versions do not trigger consent early. The v1 licence aliases stay pinned to Content Licence 1.0; new licence versions need separately reviewed mappings.

Confirmed signup carries the four agreed versions as metadata; their account-bound acceptance rows are recorded after email confirmation, before onboarding. Versions that changed in the meantime require fresh review. See `docs/terms-sheet.md` for pending activation, SMTP/Resend separation and the separate PR6 MCP integration patch.
