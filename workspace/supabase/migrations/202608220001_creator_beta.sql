-- portalinknetworks creator beta: durable profiles, portfolios, uploads, social activity,
-- comments, and notifications. Run with `supabase db push` or paste into the
-- Supabase SQL editor once for a new project.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 48),
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9._-]{1,19}$'),
  headline text not null check (char_length(headline) between 1 and 80),
  location text not null default '' check (char_length(location) <= 48),
  avatar_url text not null default '',
  nav_heading text not null default 'PORTFOLIO',
  stats jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '{}'::jsonb,
  links jsonb not null default '[]'::jsonb,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio_categories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  icon_name text not null default 'FolderIcon',
  format text not null default 'grid' check (format in ('grid','gallery','story','feed','video','audio','data')),
  blurb text not null default '',
  position integer not null default 0,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique(profile_id, label)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.portfolio_categories(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 220),
  design jsonb,
  position integer not null default 0,
  is_hidden boolean not null default false,
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision uuid not null default gen_random_uuid()
);

create table public.project_attachments (
  -- The storage path is the stable object id handed to the frontend.
  id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','document','model3d','unknown')),
  file_name text not null,
  display_name text not null,
  extension text not null default '',
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  type_label text not null,
  storage_path text not null unique,
  status text not null check (status in ('preparing','uploading','processing','ready','conversion-required','preview-limited','preview-unavailable','upload-failed','processing-failed')),
  is_cover boolean not null default false,
  position integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.project_drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.portfolio_categories(id) on delete cascade,
  title text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_follows (
  follower_account_id uuid not null references auth.users(id) on delete cascade,
  follower_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','following')),
  created_at timestamptz not null default now(),
  primary key (follower_account_id, target_profile_id),
  check (follower_profile_id <> target_profile_id)
);

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_profile_id uuid not null constraint project_comments_author_profile_id_fkey references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  parent_id uuid references public.project_comments(id) on delete cascade,
  root_id uuid references public.project_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_engagement (
  account_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('like','save','repost')),
  created_at timestamptz not null default now(),
  primary key (account_id, project_id, kind)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index portfolio_categories_profile_position_idx on public.portfolio_categories(profile_id, position);
create index projects_profile_published_idx on public.projects(profile_id, published_at desc);
create index projects_category_position_idx on public.projects(category_id, position);
create index project_attachments_project_position_idx on public.project_attachments(project_id, position);
create index project_comments_project_created_idx on public.project_comments(project_id, created_at);
create index profile_follows_target_status_idx on public.profile_follows(target_profile_id, status);
create index project_engagement_project_kind_idx on public.project_engagement(project_id, kind);
create index notifications_account_created_idx on public.notifications(account_id, created_at desc);

create or replace function public.owns_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.account_id = (select auth.uid())
  );
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and (
        not p.is_private
        or p.account_id = (select auth.uid())
        or exists (
          select 1 from public.profile_follows f
          where f.target_profile_id = p.id
            and f.follower_account_id = (select auth.uid())
            and f.status = 'following'
        )
        or exists (
          -- A private creator who asks to follow someone must be identifiable to
          -- the creator receiving that request.
          select 1 from public.profile_follows f
          where f.follower_profile_id = p.id
            and public.owns_profile(f.target_profile_id)
        )
      )
  );
$$;

create or replace function public.path_profile_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  return first_segment::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.follow_status_for_target(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p.is_private then 'pending' else 'following' end
  from public.profiles p
  where p.id = p_profile_id;
$$;

revoke all on function public.owns_profile(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.path_profile_id(text) from public;
revoke all on function public.follow_status_for_target(uuid) from public;
grant execute on function public.owns_profile(uuid) to anon, authenticated;
grant execute on function public.can_view_profile(uuid) to anon, authenticated;
grant execute on function public.path_profile_id(text) to anon, authenticated;
grant execute on function public.follow_status_for_target(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.portfolio_categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_attachments enable row level security;
alter table public.project_drafts enable row level security;
alter table public.profile_follows enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_engagement enable row level security;
alter table public.notifications enable row level security;

create policy profiles_read on public.profiles for select to anon, authenticated
using (public.can_view_profile(id));
create policy profiles_insert on public.profiles for insert to authenticated
with check (account_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));
create policy profiles_delete on public.profiles for delete to authenticated
using (account_id = (select auth.uid()));

create policy categories_read on public.portfolio_categories for select to anon, authenticated
using ((not is_hidden and public.can_view_profile(profile_id)) or public.owns_profile(profile_id));
create policy categories_insert on public.portfolio_categories for insert to authenticated
with check (public.owns_profile(profile_id));
create policy categories_update on public.portfolio_categories for update to authenticated
using (public.owns_profile(profile_id)) with check (public.owns_profile(profile_id));
create policy categories_delete on public.portfolio_categories for delete to authenticated
using (public.owns_profile(profile_id));

create policy projects_read on public.projects for select to anon, authenticated
using ((not is_hidden and public.can_view_profile(profile_id)) or public.owns_profile(profile_id));
create policy projects_insert on public.projects for insert to authenticated
with check (
  public.owns_profile(projects.profile_id)
  and exists (
    select 1 from public.portfolio_categories c
    where c.id = projects.category_id and c.profile_id = projects.profile_id
  )
);
create policy projects_update on public.projects for update to authenticated
using (public.owns_profile(profile_id))
with check (
  public.owns_profile(projects.profile_id)
  and exists (
    select 1 from public.portfolio_categories c
    where c.id = projects.category_id and c.profile_id = projects.profile_id
  )
);
create policy projects_delete on public.projects for delete to authenticated
using (public.owns_profile(profile_id));

create policy attachments_read on public.project_attachments for select to anon, authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_id
    and ((not p.is_hidden and public.can_view_profile(p.profile_id)) or public.owns_profile(p.profile_id))
));
create policy attachments_insert on public.project_attachments for insert to authenticated
with check (exists (
  select 1 from public.projects p
  where p.id = project_attachments.project_id
    and public.owns_profile(p.profile_id)
    and public.path_profile_id(project_attachments.storage_path) = p.profile_id
));
create policy attachments_update on public.project_attachments for update to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = project_attachments.project_id and public.owns_profile(p.profile_id)
)) with check (exists (
  select 1 from public.projects p
  where p.id = project_attachments.project_id
    and public.owns_profile(p.profile_id)
    and public.path_profile_id(project_attachments.storage_path) = p.profile_id
));
create policy attachments_delete on public.project_attachments for delete to authenticated
using (exists (
  select 1 from public.projects p where p.id = project_id and public.owns_profile(p.profile_id)
));

create policy drafts_owner_all on public.project_drafts for all to authenticated
using (public.owns_profile(project_drafts.profile_id)) with check (
  public.owns_profile(project_drafts.profile_id)
  and exists (
    select 1 from public.portfolio_categories c
    where c.id = project_drafts.category_id and c.profile_id = project_drafts.profile_id
  )
);

create policy follows_read on public.profile_follows for select to authenticated
using (follower_account_id = (select auth.uid()) or public.owns_profile(target_profile_id));
create policy follows_insert on public.profile_follows for insert to authenticated
with check (
  follower_account_id = (select auth.uid())
  and public.owns_profile(follower_profile_id)
  and not public.owns_profile(target_profile_id)
  and status = public.follow_status_for_target(target_profile_id)
);
create policy follows_update on public.profile_follows for update to authenticated
using (public.owns_profile(target_profile_id))
with check (public.owns_profile(target_profile_id));
create policy follows_delete on public.profile_follows for delete to authenticated
using (follower_account_id = (select auth.uid()) or public.owns_profile(target_profile_id));

create policy comments_read on public.project_comments for select to anon, authenticated
using (exists (
  select 1 from public.projects p where p.id = project_comments.project_id and public.can_view_profile(p.profile_id)
));
create policy comments_insert on public.project_comments for insert to authenticated
with check (
  public.owns_profile(author_profile_id)
  and exists (
    select 1 from public.projects p where p.id = project_comments.project_id and public.can_view_profile(p.profile_id)
  )
);
create policy comments_delete on public.project_comments for delete to authenticated
using (public.owns_profile(author_profile_id));

create policy engagement_read_own on public.project_engagement for select to authenticated
using (account_id = (select auth.uid()));
create policy engagement_insert_own on public.project_engagement for insert to authenticated
with check (
  account_id = (select auth.uid())
  and exists (
    select 1 from public.projects p where p.id = project_engagement.project_id and public.can_view_profile(p.profile_id)
  )
);

grant select on public.profiles, public.portfolio_categories, public.projects,
  public.project_attachments, public.project_comments to anon, authenticated;
grant insert, update, delete on public.profiles, public.portfolio_categories,
  public.projects, public.project_attachments, public.project_comments to authenticated;
grant select, insert, update, delete on public.project_drafts,
  public.project_engagement, public.notifications to authenticated;
grant select, insert, delete on public.profile_follows to authenticated;
grant update(status) on public.profile_follows to authenticated;
create policy engagement_delete_own on public.project_engagement for delete to authenticated
using (account_id = (select auth.uid()));

create policy notifications_owner_all on public.notifications for all to authenticated
using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
for each row execute function public.touch_updated_at();
create trigger drafts_touch before update on public.project_drafts
for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.project_comments
for each row execute function public.touch_updated_at();

create or replace function public.validate_comment_thread()
returns trigger language plpgsql set search_path = public as $$
declare parent_project uuid;
declare parent_root uuid;
begin
  if new.parent_id is null then
    new.root_id := null;
    return new;
  end if;
  select project_id, root_id into parent_project, parent_root
  from public.project_comments where id = new.parent_id;
  if parent_project is null or parent_project <> new.project_id then
    raise exception 'comment parent does not belong to this project';
  end if;
  new.root_id := coalesce(parent_root, new.parent_id);
  return new;
end;
$$;
create trigger comments_validate_thread before insert or update of parent_id, project_id
on public.project_comments for each row execute function public.validate_comment_thread();

create or replace function public.create_default_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.portfolio_categories(profile_id, label, icon_name, format, blurb, position)
  values (new.id, 'Work', 'FolderIcon', 'grid', 'Selected work', 0);
  return new;
end;
$$;
create trigger profiles_default_category after insert on public.profiles
for each row execute function public.create_default_category();

create or replace function public.publish_project(
  p_draft_id uuid,
  p_profile_id uuid,
  p_category_id uuid,
  p_title text,
  p_summary text,
  p_attachments jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  new_project_id uuid;
  item jsonb;
  next_position integer;
  object_path text;
begin
  if not public.owns_profile(p_profile_id) then raise exception 'not owner'; end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_summary), '') is null then raise exception 'invalid metadata'; end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) < 1 or jsonb_array_length(p_attachments) > 24 then
    raise exception 'invalid media';
  end if;
  if not exists (
    select 1 from public.project_drafts d
    where d.id = p_draft_id and d.profile_id = p_profile_id and d.category_id = p_category_id
  ) then raise exception 'draft not found'; end if;
  if not exists (
    select 1 from public.portfolio_categories c
    where c.id = p_category_id and c.profile_id = p_profile_id
  ) then raise exception 'category not found'; end if;

  for item in select value from jsonb_array_elements(p_attachments)
  loop
    object_path := item->>'storagePath';
    if public.path_profile_id(object_path) is distinct from p_profile_id
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'project-media' and o.name = object_path
      ) then
      raise exception 'invalid media storage reference';
    end if;
  end loop;

  select coalesce(max(position), -1) + 1 into next_position
  from public.projects where category_id = p_category_id;

  insert into public.projects(profile_id, category_id, title, summary, position)
  values (p_profile_id, p_category_id, trim(p_title), trim(p_summary), next_position)
  returning id into new_project_id;

  for item in select value from jsonb_array_elements(p_attachments)
  loop
    insert into public.project_attachments(
      id, project_id, kind, file_name, display_name, extension, mime_type,
      size_bytes, type_label, storage_path, status, is_cover, position, metadata
    ) values (
      item->>'id', new_project_id, item->>'kind', item->>'fileName', item->>'displayName',
      coalesce(item->>'extension', ''), coalesce(item->>'mimeType', 'application/octet-stream'),
      coalesce((item->>'sizeBytes')::bigint, 0), item->>'typeLabel', item->>'storagePath',
      item->>'status', coalesce((item->>'isCover')::boolean, false),
      coalesce((item->>'order')::integer, 0), item->'metadata'
    );
  end loop;

  delete from public.project_drafts where id = p_draft_id;
  return new_project_id;
end;
$$;

create or replace function public.update_project(
  p_project_id uuid,
  p_profile_id uuid,
  p_title text,
  p_summary text,
  p_kept jsonb,
  p_added jsonb,
  p_expected_revision text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  item jsonb;
  current_revision text;
  removed_ids text[];
  removed_paths text[];
  object_path text;
begin
  if not public.owns_profile(p_profile_id) then raise exception 'not owner'; end if;
  select revision::text into current_revision from public.projects
  where id = p_project_id and profile_id = p_profile_id for update;
  if current_revision is null then raise exception 'project not found'; end if;
  if p_expected_revision is not null and p_expected_revision <> current_revision then raise exception 'revision conflict'; end if;
  if jsonb_array_length(coalesce(p_kept, '[]'::jsonb)) + jsonb_array_length(coalesce(p_added, '[]'::jsonb)) < 1 then
    raise exception 'invalid media';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_kept, '[]'::jsonb)) k
    where not exists (
      select 1 from public.project_attachments a
      where a.id = k->>'id' and a.project_id = p_project_id
    )
  ) then raise exception 'invalid media'; end if;

  select coalesce(array_agg(id), '{}'), coalesce(array_agg(storage_path), '{}')
  into removed_ids, removed_paths
  from public.project_attachments a
  where a.project_id = p_project_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_kept, '[]'::jsonb)) k
      where k->>'id' = a.id
    );

  update public.projects set title = trim(p_title), summary = trim(p_summary), revision = gen_random_uuid()
  where id = p_project_id and profile_id = p_profile_id;

  for item in select value from jsonb_array_elements(coalesce(p_kept, '[]'::jsonb))
  loop
    update public.project_attachments set
      display_name = coalesce(nullif(trim(item->>'displayName'), ''), display_name),
      position = coalesce((item->>'order')::integer, position),
      is_cover = coalesce((item->>'isCover')::boolean, false)
    where id = item->>'id' and project_id = p_project_id;
  end loop;

  delete from public.project_attachments where id = any(removed_ids);

  for item in select value from jsonb_array_elements(coalesce(p_added, '[]'::jsonb))
  loop
    object_path := item->>'storagePath';
    if public.path_profile_id(object_path) is distinct from p_profile_id
      or not exists (select 1 from storage.objects o where o.bucket_id = 'project-media' and o.name = object_path)
    then raise exception 'invalid media storage reference'; end if;
    insert into public.project_attachments(
      id, project_id, kind, file_name, display_name, extension, mime_type,
      size_bytes, type_label, storage_path, status, is_cover, position, metadata
    ) values (
      item->>'id', p_project_id, item->>'kind', item->>'fileName', item->>'displayName',
      coalesce(item->>'extension', ''), coalesce(item->>'mimeType', 'application/octet-stream'),
      coalesce((item->>'sizeBytes')::bigint, 0), item->>'typeLabel', item->>'storagePath',
      item->>'status', coalesce((item->>'isCover')::boolean, false),
      coalesce((item->>'order')::integer, 0), item->'metadata'
    );
  end loop;

  return jsonb_build_object(
    'removedAttachmentIds', to_jsonb(removed_ids),
    'removedStoragePaths', to_jsonb(removed_paths)
  );
end;
$$;

create or replace function public.follower_count(p_profile_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.can_view_profile(p_profile_id) then (
      select count(*) from public.profile_follows
      where target_profile_id = p_profile_id and status = 'following'
    )
    else 0
  end;
$$;

create or replace function public.project_engagement_summary(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'like_count', count(*) filter (where kind = 'like'),
    'save_count', count(*) filter (where kind = 'save'),
    'repost_count', count(*) filter (where kind = 'repost')
  )
  from public.project_engagement
  where project_id = p_project_id
    and exists (
      select 1 from public.projects p
      where p.id = p_project_id
        and ((not p.is_hidden and public.can_view_profile(p.profile_id)) or public.owns_profile(p.profile_id))
    );
$$;

revoke all on function public.publish_project(uuid,uuid,uuid,text,text,jsonb) from public;
revoke all on function public.update_project(uuid,uuid,text,text,jsonb,jsonb,text) from public;
revoke all on function public.follower_count(uuid) from public;
revoke all on function public.project_engagement_summary(uuid) from public;
grant execute on function public.publish_project(uuid,uuid,uuid,text,text,jsonb) to authenticated;
grant execute on function public.update_project(uuid,uuid,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.follower_count(uuid) to anon, authenticated;
grant execute on function public.project_engagement_summary(uuid) to anon, authenticated;

create or replace function public.notify_community_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_account uuid;
declare actor_name text;
begin
  if tg_table_name = 'profile_follows' then
    select account_id into target_account from public.profiles where id = new.target_profile_id;
    select name into actor_name from public.profiles where id = new.follower_profile_id;
    if target_account is distinct from new.follower_account_id then
      insert into public.notifications(account_id, body)
      values (target_account, actor_name || case when new.status = 'pending' then ' requested to follow you.' else ' followed you.' end);
    end if;
  elsif tg_table_name = 'project_comments' then
    select p.account_id into target_account
    from public.projects pr join public.profiles p on p.id = pr.profile_id
    where pr.id = new.project_id;
    select name into actor_name from public.profiles where id = new.author_profile_id;
    if target_account is distinct from (select account_id from public.profiles where id = new.author_profile_id) then
      insert into public.notifications(account_id, body)
      values (target_account, actor_name || ' commented on your work.');
    end if;
  end if;
  return new;
end;
$$;

create trigger follow_notification after insert on public.profile_follows
for each row execute function public.notify_community_activity();
create trigger comment_notification after insert on public.project_comments
for each row execute function public.notify_community_activity();

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 4194304)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-media', 'project-media', false, 524288000)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

create policy avatar_upload on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatar_owner_read on storage.objects for select to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text));
create policy avatar_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
create policy avatar_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

create policy project_media_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'project-media'
  and (
    public.owns_profile(public.path_profile_id(name))
    or exists (
      select 1 from public.project_attachments a
      where a.storage_path = storage.objects.name
    )
  )
);
create policy project_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'project-media' and public.owns_profile(public.path_profile_id(name)));
create policy project_media_update on storage.objects for update to authenticated
using (bucket_id = 'project-media' and public.owns_profile(public.path_profile_id(name)));
create policy project_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'project-media' and public.owns_profile(public.path_profile_id(name)));
