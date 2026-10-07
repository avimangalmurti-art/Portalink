-- Search the full eligible public corpus, returning only the requested result
-- cards. No new table, public data copy, or change to private-content RLS.
begin;

create or replace function public.search_normalized_text(value text)
returns text language sql immutable parallel safe set search_path = public as $$
  select trim(regexp_replace(lower(normalize(coalesce(value, ''), NFKD)), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.profile_search_document(name text, handle text, headline text, location text)
returns tsvector language sql immutable parallel safe set search_path = public as $$
  select to_tsvector('simple', public.search_normalized_text(coalesce(name,'') || ' ' || coalesce(handle,'') || ' ' || coalesce(headline,'') || ' ' || coalesce(location,'')));
$$;

create or replace function public.project_search_document(title text, summary text, topics text[])
returns tsvector language sql immutable parallel safe set search_path = public as $$
  select to_tsvector('simple', public.search_normalized_text(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(array_to_string(topics,' '),'')));
$$;

create index if not exists profiles_public_search_idx on public.profiles
  using gin(public.profile_search_document(name,handle,headline,location)) where not is_private;
create index if not exists projects_visible_search_idx on public.projects
  using gin(public.project_search_document(title,summary,topic_keys)) where not is_hidden;
create index if not exists categories_visible_search_idx on public.portfolio_categories
  using gin(to_tsvector('simple', public.search_normalized_text(label))) where not is_hidden;

create or replace function public.search_public_content(p_terms text[], p_location text default null)
returns table(id uuid, kind text, title text, subtitle text, avatar text)
language plpgsql stable security invoker set search_path = public as $$
declare all_terms tsquery; any_terms tsquery; city text := public.search_normalized_text(p_location);
begin
  if p_terms is null or cardinality(p_terms) > 32 or array_ndims(p_terms) > 1
    or exists (select 1 from unnest(p_terms) term where term is null or term !~ '^[a-z0-9]{2,100}$') then
    raise exception 'Use a shorter search phrase.';
  end if;
  -- Match exact short words; four-letter and longer words also match prefixes,
  -- preserving the established search behavior rather than substring matching.
  select to_tsquery('simple', string_agg(quote_literal(term) || case when length(term) >= 4 then ':*' else '' end, ' & ')),
    to_tsquery('simple', string_agg(quote_literal(term) || case when length(term) >= 4 then ':*' else '' end, ' | '))
    into all_terms, any_terms from unnest(p_terms) term;

  return query
    select u.id, 'profile'::text, u.name, '@' || u.handle, u.avatar_url
    from public.profiles u
    where not u.is_private
      and (all_terms is null or public.profile_search_document(u.name,u.handle,u.headline,u.location) @@ all_terms)
      and (city = '' or (' ' || public.search_normalized_text(u.location) || ' ') like ('% ' || city || ' %'))
    order by lower(u.name), u.id limit 20;

  return query
    select p.id, 'project'::text, p.title, coalesce(nullif(p.summary,''), c.label), null::text
    from public.projects p
    join public.profiles u on u.id = p.profile_id
    join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
    where not p.is_hidden and not c.is_hidden and not u.is_private
      and (city = '' or (' ' || public.search_normalized_text(u.location) || ' ') like ('% ' || city || ' %'))
      and (all_terms is null or (
        (public.project_search_document(p.title,p.summary,p.topic_keys) @@ any_terms
          or p.category_id in (select category.id from public.portfolio_categories category
            where not category.is_hidden and to_tsvector('simple', public.search_normalized_text(category.label)) @@ any_terms))
        and (public.project_search_document(p.title,p.summary,p.topic_keys) || to_tsvector('simple', public.search_normalized_text(c.label))) @@ all_terms
      ))
    order by p.published_at desc, p.id limit 30;
end;
$$;

revoke all on function public.search_public_content(text[],text) from public;
grant execute on function public.search_public_content(text[],text) to anon,authenticated;

commit;
