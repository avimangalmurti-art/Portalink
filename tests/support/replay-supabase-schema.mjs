import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const migrations = new URL('../../supabase/migrations/', import.meta.url);

// PGlite models PostgreSQL. These are the provider-owned roles, tables and
// helpers that Supabase itself installs before running project migrations.
export const providerSchema = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create role authenticator;
  create schema auth;
  create schema storage;
  create schema realtime;
  create table auth.users (id uuid primary key, email text);
  create table auth.sessions (
    id uuid primary key, user_id uuid references auth.users(id) on delete cascade, not_after timestamptz,
    user_agent text, created_at timestamptz default now(), refreshed_at timestamptz
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt()->>'sub')::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt()->>'role')
  $$;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text,
    metadata jsonb default '{}', owner uuid, owner_id text
  );
  create function storage.foldername(path text) returns text[] language sql immutable as $$
    select (string_to_array(path, '/'))[1:array_length(string_to_array(path, '/'), 1)-1]
  $$;
  create table realtime.messages (id uuid primary key default gen_random_uuid(), extension text);
  create function realtime.topic() returns text language sql stable as $$
    select current_setting('realtime.topic', true)
  $$;
  create function realtime.send(jsonb, text, text, boolean) returns void language plpgsql as $$
    begin return; end;
  $$;
  revoke all on function realtime.send(jsonb, text, text, boolean) from public, anon, authenticated;
  alter table storage.objects enable row level security;
  alter table realtime.messages enable row level security;
  grant usage on schema public, auth, storage, realtime to anon, authenticated, service_role;
  grant select on storage.objects to anon;
  grant all on storage.objects to authenticated, service_role;
  grant select, insert on realtime.messages to authenticated;
  create publication supabase_realtime;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export const pgliteModulePath = process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;

export async function replaySupabaseSchema() {
  const files = readdirSync(migrations).filter(name => name.endsWith('.sql')).sort();
  const versions = new Set();
  for (const file of files) {
    const version = /^(\d+)_.+\.sql$/.exec(file)?.[1];
    if (!version || versions.has(version)) throw new Error(`Invalid or duplicate migration version: ${file}`);
    versions.add(version);
  }
  const moduleUrl = pgliteModulePath
    ? pathToFileURL(pgliteModulePath)
    : new URL(import.meta.resolve('@electric-sql/pglite'));
  const { PGlite } = await import(moduleUrl.href);
  const { pgcrypto } = await import(new URL('./contrib/pgcrypto.js', moduleUrl).href);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(providerSchema);
    for (const file of files) {
      try {
        await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
      } catch (error) {
        throw new Error(`Could not apply ${file}: ${error.message}`, { cause: error });
      }
    }
    return { db, files };
  } catch (error) {
    await db.close();
    throw error;
  }
}
