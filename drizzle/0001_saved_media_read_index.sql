-- Additive read-path index only. Existing bookmarks and ownership are unchanged.
CREATE INDEX IF NOT EXISTS idx_media_engagements_account_kind_created
  ON media_engagements(account_id, kind, created_at DESC);
