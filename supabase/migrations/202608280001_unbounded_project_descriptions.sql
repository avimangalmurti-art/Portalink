-- Profile-page description edits are intentionally prose-length rather than
-- caption-length. `summary` is already PostgreSQL `text`; removing the legacy
-- 220-character check lets the owner save the complete description while the
-- UI keeps the fixed card geometry through an internal scroll region.

alter table public.projects
  drop constraint if exists projects_summary_check;
