CREATE TABLE IF NOT EXISTS media_engagements (
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  page_index INTEGER NOT NULL CHECK (page_index >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('like', 'save', 'repost')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, project_id, attachment_id, page_index, kind)
);

CREATE INDEX IF NOT EXISTS idx_media_engagements_target
ON media_engagements(project_id, attachment_id, page_index, kind);

CREATE TABLE IF NOT EXISTS media_comments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  page_index INTEGER NOT NULL CHECK (page_index >= 0),
  author_name TEXT NOT NULL,
  author_avatar_url TEXT,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_comments_target_created
ON media_comments(project_id, attachment_id, page_index, created_at);

CREATE INDEX IF NOT EXISTS idx_media_comments_account
ON media_comments(account_id);

PRAGMA optimize;
