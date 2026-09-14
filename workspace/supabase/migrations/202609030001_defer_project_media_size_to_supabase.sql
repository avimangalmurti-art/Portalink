-- Portalink does not impose a second file-size ceiling. The Supabase project's
-- global Storage setting is the single source of truth for every project file.

update storage.buckets
set file_size_limit = null
where id = 'project-media';

-- Keep the existing storage trigger compatible while making it a pass-through:
-- Supabase now owns this boundary through its global limit.
create or replace function public.enforce_pdf_storage_ingestion()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  return new;
end;
$$;

-- Keep PDF integrity validation without imposing a Portalink-specific size
-- limit. Original files remain available while page rendering is queued.
create or replace function public.prepare_pdf_attachment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_pdf_attachment(new.mime_type, new.extension, new.file_name)
    and new.size_bytes <= 0
  then
    raise exception using
      errcode = '22023',
      message = 'The PDF file is empty';
  end if;
  return new;
end;
$$;
