-- Supabase's Free plan has a fixed 50 MiB global upload ceiling. Keep the
-- project bucket and PDF-specific validation aligned so creators get one clear
-- limit instead of a late storage rejection.

update storage.buckets
set file_size_limit = 52428800
where id = 'project-media';

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

create or replace function public.prepare_pdf_attachment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_pdf_attachment(new.mime_type, new.extension, new.file_name) then
    if new.size_bytes > 52428800 then
      raise exception using
        errcode = '22023',
        message = 'PDF files must be 50 MB or smaller';
    end if;
    if new.size_bytes <= 0 then
      raise exception using
        errcode = '22023',
        message = 'The PDF file is empty';
    end if;
  end if;
  return new;
end;
$$;
