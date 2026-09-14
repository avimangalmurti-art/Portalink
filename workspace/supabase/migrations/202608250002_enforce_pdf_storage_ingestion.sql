-- Reject oversized PDFs at the object-storage boundary, before a project record
-- can reference them. The publication trigger and Python worker repeat this
-- check so direct database writes and stale storage metadata cannot bypass it.

create or replace function public.enforce_pdf_storage_ingestion()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  object_size bigint;
  object_mime text;
begin
  if new.bucket_id <> 'project-media' then
    return new;
  end if;

  object_mime := lower(trim(coalesce(new.metadata ->> 'mimetype', '')));
  if object_mime = 'application/pdf' or lower(new.name) like '%.pdf' then
    begin
      object_size := coalesce(
        nullif(new.metadata ->> 'size', '')::bigint,
        nullif(new.metadata ->> 'contentLength', '')::bigint,
        0
      );
    exception when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'The PDF upload has invalid size metadata';
    end;

    if object_size > 52428800 then
      raise exception using
        errcode = '22023',
        message = 'PDF files must be 50 MB or smaller';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_media_enforce_pdf_ingestion on storage.objects;
create trigger project_media_enforce_pdf_ingestion
before insert or update of name, metadata
on storage.objects
for each row execute function public.enforce_pdf_storage_ingestion();

