-- PREPARED ONLY. Apply to the existing Sites D1 database only after approval.
-- No identities, full paths, IP addresses, user agents, or raw viewport widths.
CREATE TABLE IF NOT EXISTS page_timings (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  route_kind TEXT NOT NULL CHECK (route_kind IN ('share', 'profile', 'project', 'home')),
  boot_ms REAL CHECK (boot_ms IS NULL OR boot_ms BETWEEN 0 AND 86400000),
  data_ms REAL CHECK (data_ms IS NULL OR data_ms BETWEEN 0 AND 86400000),
  cover_ms REAL CHECK (cover_ms IS NULL OR cover_ms BETWEEN 0 AND 86400000),
  pdf_ms REAL CHECK (pdf_ms IS NULL OR pdf_ms BETWEEN 0 AND 86400000),
  vw_bucket TEXT NOT NULL CHECK (vw_bucket IN ('<400', '400-639', '640-1023', '1024-1439', '1440+')),
  conn TEXT NOT NULL CHECK (conn IN ('slow-2g', '2g', '3g', '4g', 'unknown')),
  version TEXT NOT NULL CHECK (length(version) BETWEEN 7 AND 64 AND version NOT GLOB '*[^a-f0-9]*')
);

CREATE INDEX IF NOT EXISTS idx_page_timings_at ON page_timings(at);
