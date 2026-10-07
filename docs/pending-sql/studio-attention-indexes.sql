-- PREPARED ONLY. NOT APPLIED. D1, not Supabase.
-- Review alongside the existing project_read_signals migration; the endpoint
-- works with existing indexes. This optional index supports owner-response checks.
CREATE INDEX IF NOT EXISTS idx_media_comments_target_author_created
ON media_comments(project_id, attachment_id, page_index, account_id, created_at);
-- No new data, backfill, reply relationship, portal fields or credits are invented.
