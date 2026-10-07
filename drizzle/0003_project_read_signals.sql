-- PREPARED ONLY: approval required before moving to drizzle/ or applying.
-- Sites automatically applies drizzle/*.sql during publication.
CREATE TABLE project_reach_events (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, project_id TEXT NOT NULL,
  session_hash TEXT NOT NULL, furthest_page INTEGER NOT NULL CHECK(furthest_page>=-1),
  page_count INTEGER NOT NULL CHECK(page_count BETWEEN 1 AND 10000),
  ref_class TEXT NOT NULL CHECK(ref_class IN ('own-link','messages','linkedin','other')),
  vw_bucket TEXT NOT NULL CHECK(vw_bucket IN ('<400','400-639','640-1023','1024-1439','1440+')),
  CHECK(furthest_page<page_count), UNIQUE(project_id,session_hash)
);
CREATE INDEX idx_project_reach_events_project_at ON project_reach_events(project_id,at);
CREATE INDEX idx_project_reach_events_at ON project_reach_events(at);
CREATE TABLE project_reach_daily (
  project_id TEXT NOT NULL, day TEXT NOT NULL, opened INTEGER NOT NULL DEFAULT 0,
  finished INTEGER NOT NULL DEFAULT 0, max_page_hist TEXT NOT NULL DEFAULT '{}',
  ref_counts TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(project_id,day)
);
CREATE INDEX idx_project_reach_daily_day ON project_reach_daily(day);
-- Insert + maxima update + rollup are a single SQLite transaction, including retries.
CREATE TRIGGER project_reach_insert AFTER INSERT ON project_reach_events BEGIN
  INSERT INTO project_reach_daily(project_id,day,opened,finished,max_page_hist,ref_counts)
  VALUES(NEW.project_id,substr(NEW.at,1,10),1,NEW.furthest_page>=NEW.page_count-1,
    json_object(CAST(NEW.furthest_page AS TEXT),1),json_object(NEW.ref_class,1))
  ON CONFLICT(project_id,day) DO UPDATE SET opened=opened+1,
    finished=finished+(NEW.furthest_page>=NEW.page_count-1),
    max_page_hist=json_set(max_page_hist,'$."'||NEW.furthest_page||'"',coalesce(json_extract(max_page_hist,'$."'||NEW.furthest_page||'"'),0)+1),
    ref_counts=json_set(ref_counts,'$."'||NEW.ref_class||'"',coalesce(json_extract(ref_counts,'$."'||NEW.ref_class||'"'),0)+1);
END;
CREATE TRIGGER project_reach_advance AFTER UPDATE OF furthest_page ON project_reach_events
WHEN NEW.furthest_page>OLD.furthest_page BEGIN
  UPDATE project_reach_daily SET
    finished=finished+(NEW.furthest_page>=NEW.page_count-1 AND OLD.furthest_page<OLD.page_count-1),
    max_page_hist=json_set(max_page_hist,
      '$."'||OLD.furthest_page||'"',max(0,coalesce(json_extract(max_page_hist,'$."'||OLD.furthest_page||'"'),0)-1),
      '$."'||NEW.furthest_page||'"',coalesce(json_extract(max_page_hist,'$."'||NEW.furthest_page||'"'),0)+1)
  WHERE project_id=NEW.project_id AND day=substr(NEW.at,1,10);
END;
-- This table identifies ONLY new deliberately disclosed saves and public comments.
-- Historical private saves are never copied into it. Removing a save revokes its event.
CREATE TABLE project_page_actions (
  id TEXT PRIMARY KEY, owner_account_id TEXT NOT NULL, actor_account_id TEXT NOT NULL,
  actor_profile_id TEXT NOT NULL, actor_name TEXT NOT NULL,
  project_id TEXT NOT NULL, attachment_id TEXT NOT NULL, page_index INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('save','comment')), at TEXT NOT NULL,
  project_title TEXT NOT NULL, heading TEXT, target_path TEXT NOT NULL, comment_id TEXT
);
CREATE INDEX idx_project_page_actions_owner_at ON project_page_actions(owner_account_id,at);
CREATE INDEX idx_project_page_actions_project_target ON project_page_actions(project_id,attachment_id,page_index);
CREATE TRIGGER revoke_disclosed_save AFTER DELETE ON media_engagements WHEN OLD.kind='save' BEGIN
  DELETE FROM project_page_actions WHERE actor_account_id=OLD.account_id AND project_id=OLD.project_id
    AND attachment_id=OLD.attachment_id AND page_index=OLD.page_index AND kind='save';
END;
CREATE TRIGGER revoke_page_comment AFTER DELETE ON media_comments BEGIN
  DELETE FROM project_page_actions WHERE comment_id=OLD.id AND kind='comment';
END;
CREATE TABLE project_notification_reads (
  owner_account_id TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, read_at TEXT NOT NULL,
  PRIMARY KEY(owner_account_id,id)
);
CREATE TABLE project_weekly_notes (
  owner_account_id TEXT NOT NULL, project_id TEXT NOT NULL, week_key TEXT NOT NULL,
  at TEXT NOT NULL, opened INTEGER NOT NULL, finished INTEGER NOT NULL,
  PRIMARY KEY(owner_account_id,project_id,week_key)
);
PRAGMA optimize;
