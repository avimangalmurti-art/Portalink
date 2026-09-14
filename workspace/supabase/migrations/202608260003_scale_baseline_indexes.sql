-- Portalink scale baseline.
-- These indexes cover the bounded read patterns used by Home discovery and the
-- viewer-specific relationship/engagement context. They are additive and safe
-- to apply before traffic grows.

create index if not exists projects_visible_published_idx
  on public.projects (published_at desc, id)
  where is_hidden = false;

create index if not exists profile_follows_follower_status_target_idx
  on public.profile_follows (follower_account_id, status, target_profile_id);

create index if not exists project_engagement_account_created_idx
  on public.project_engagement (account_id, created_at desc, project_id, kind);

