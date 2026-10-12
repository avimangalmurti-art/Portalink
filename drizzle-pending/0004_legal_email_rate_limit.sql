-- Pending review/activation. Do not move to the automatic D1 migration folder yet.
CREATE TABLE legal_email_sends (
  account_id TEXT PRIMARY KEY NOT NULL,
  claimed_at INTEGER NOT NULL,
  request_id TEXT NOT NULL
);
