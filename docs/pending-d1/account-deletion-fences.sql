-- PREPARED ONLY. Never copy into auto-applied drizzle or apply without approval.
-- Requires the existing media/read-signal tables. This is D1 SQLite, not Supabase SQL.
-- Fences are permanent security receipts for immutable IDs; do not delete them
-- during account cleanup or disable triggers while issued requests can still run.
BEGIN TRANSACTION;
CREATE TABLE account_deletion_d1_fences (
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('account','project')),
  scope_id TEXT NOT NULL CHECK(length(scope_id)=36),
  job_id TEXT NOT NULL CHECK(length(job_id)=36),
  manifest_digest TEXT NOT NULL CHECK(length(manifest_digest)=64),
  blocked_at TEXT NOT NULL,
  PRIMARY KEY(scope_kind,scope_id)
);
CREATE UNIQUE INDEX account_deletion_d1_one_account_per_job
ON account_deletion_d1_fences(job_id) WHERE scope_kind='account';

-- Both inserts and updates are fenced inside the actual write transaction.
-- A preflight check alone cannot stop a request already in flight at cleanup.
CREATE TRIGGER deletion_fence_engagement_insert BEFORE INSERT ON media_engagements
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id=NEW.account_id) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_engagement_update BEFORE UPDATE ON media_engagements
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id=NEW.account_id) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_comment_insert BEFORE INSERT ON media_comments
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id=NEW.account_id) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_comment_update BEFORE UPDATE ON media_comments
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id=NEW.account_id) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_action_insert BEFORE INSERT ON project_page_actions
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id IN (NEW.actor_account_id,NEW.owner_account_id)) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_action_update BEFORE UPDATE ON project_page_actions
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id IN (NEW.actor_account_id,NEW.owner_account_id)) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_notification_insert BEFORE INSERT ON project_notification_reads
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE scope_kind='account' AND scope_id=NEW.owner_account_id)
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_notification_update BEFORE UPDATE ON project_notification_reads
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE scope_kind='account' AND scope_id=NEW.owner_account_id)
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_weekly_insert BEFORE INSERT ON project_weekly_notes
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id=NEW.owner_account_id) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_weekly_update BEFORE UPDATE ON project_weekly_notes
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE (scope_kind='account' AND scope_id=NEW.owner_account_id) OR (scope_kind='project' AND scope_id=NEW.project_id))
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_reach_insert BEFORE INSERT ON project_reach_events
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE scope_kind='project' AND scope_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_reach_update BEFORE UPDATE ON project_reach_events
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE scope_kind='project' AND scope_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_rollup_insert BEFORE INSERT ON project_reach_daily
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE scope_kind='project' AND scope_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;
CREATE TRIGGER deletion_fence_rollup_update BEFORE UPDATE ON project_reach_daily
WHEN EXISTS(SELECT 1 FROM account_deletion_d1_fences WHERE scope_kind='project' AND scope_id=NEW.project_id)
BEGIN SELECT RAISE(ABORT,'Account deletion write blocked.'); END;

-- Fences themselves are immutable once installed. Same-digest upserts are retries.
CREATE TRIGGER deletion_fence_receipt_update BEFORE UPDATE ON account_deletion_d1_fences
WHEN NEW.scope_kind<>OLD.scope_kind OR NEW.scope_id<>OLD.scope_id OR NEW.job_id<>OLD.job_id OR NEW.manifest_digest<>OLD.manifest_digest OR NEW.blocked_at<>OLD.blocked_at
BEGIN SELECT RAISE(ABORT,'Account deletion manifest changed.'); END;
CREATE TRIGGER deletion_fence_receipt_delete BEFORE DELETE ON account_deletion_d1_fences
BEGIN SELECT RAISE(ABORT,'Account deletion fence is permanent.'); END;
COMMIT;
