-- Bounded feed reads; preserves existing RLS, Home relationships and all older
-- work through a deterministic cursor. No table/data/permission replacement.
begin;

create or replace function public.project_feed_page(
  p_scope text default 'global',
  p_before_date timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 31
)
returns table(project jsonb, creator jsonb, category jsonb, cover jsonb)
language sql stable security invoker
set search_path = public
as $$
  select
    to_jsonb(p),
    jsonb_build_object('id', u.id, 'name', u.name, 'headline', u.headline,
      'avatar_url', u.avatar_url, 'location', u.location, 'is_private', u.is_private),
    jsonb_build_object('id', c.id, 'label', c.label),
    case when jsonb_typeof(a.metadata->'renderedPages') = 'array' then
      to_jsonb(a) || jsonb_build_object('metadata',
        (a.metadata - 'renderedPages') || jsonb_build_object('renderedPages', coalesce((
          select jsonb_agg(page) from jsonb_array_elements(a.metadata->'renderedPages') page
          where page->>'attachmentId' = a.id
            and page->>'withinDocumentIndex' = case
              when a.metadata->>'coverPageNumber' ~ '^[1-9][0-9]*$' then a.metadata->>'coverPageNumber'
              else '1' end
        ), '[]'::jsonb)))
      else to_jsonb(a) end
  from public.projects p
  join public.profiles u on u.id = p.profile_id
  join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
  left join lateral (
    select attachment.* from public.project_attachments attachment
    where attachment.project_id = p.id
    order by attachment.is_cover desc, (attachment.kind = 'image') desc, attachment.position, attachment.id
    limit 1
  ) a on true
  where not p.is_hidden and not c.is_hidden
    and (
      (p_scope = 'global' and not u.is_private)
      or (p_scope = 'home' and (select auth.uid()) is not null and (
        u.account_id = (select auth.uid())
        or exists (
          select 1 from public.profile_follows f
          where f.follower_account_id = (select auth.uid())
            and f.target_profile_id = p.profile_id and f.status = 'following'
        )
      ))
    )
    and (p_before_date is null or p.published_at < p_before_date
      or (p.published_at = p_before_date and p.id > p_before_id))
  order by p.published_at desc, p.id asc
  limit least(121, greatest(1, coalesce(p_limit, 31)));
$$;

revoke all on function public.project_feed_page(text, timestamptz, uuid, integer) from public;
grant execute on function public.project_feed_page(text, timestamptz, uuid, integer) to anon, authenticated;

commit;
