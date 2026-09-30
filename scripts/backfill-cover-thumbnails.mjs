import { appendFile, mkdir, readFile, realpath, stat, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { renderCoverVariants, renderCoverAssets } from '../src/features/media/coverThumbnailCore.mjs';
import { thumbnailSourceKey, thumbnailContentHash } from '../src/features/media/coverThumbnailManifest.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SOURCE_LIMIT = 256 * 1024 * 1024;
const DEFAULT_FIXTURE = fileURLToPath(new URL('../tests/fixtures/cover-thumbnails/fixture.json', import.meta.url));
const SELECT = 'id,profile_id,category_id,revision,is_hidden,cover_thumbnail,profiles!projects_profile_id_fkey!inner(id,is_private),portfolio_categories!inner(id,profile_id,is_hidden),project_attachments(id,project_id,kind,storage_path,position,is_cover,size_bytes,mime_type,metadata)';

class BackfillError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new BackfillError(code, message); };
const relation = value => Array.isArray(value) ? value[0] : value;
const safeError = error => error instanceof BackfillError ? { code: error.code, message: error.message }
  : { code: 'processing-failed', message: 'Thumbnail preparation failed; no manifest was saved. Inspect this project before retrying.' };

export function parseArgs(args) {
  const options = { apply: false, failFast: false, fixture: null, log: 'logs/cover-thumbnail-backfill.jsonl', limit: Infinity, ffmpeg: null, help: false };
  let explicitDryRun = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') explicitDryRun = true;
    else if (arg === '--fail-fast') options.failFast = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--fixture') options.fixture = args[index + 1] && !args[index + 1].startsWith('--') ? args[++index] : DEFAULT_FIXTURE;
    else if (['--log', '--limit', '--ffmpeg'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('invalid-option', `${arg} requires a value.`);
      if (arg === '--limit') {
        if (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) fail('invalid-option', '--limit must be a positive integer.');
        options.limit = Number(value);
      } else options[arg.slice(2)] = value;
    } else fail('invalid-option', `Unknown option: ${arg}`);
  }
  if (options.apply && explicitDryRun) fail('invalid-option', 'Choose --apply or --dry-run, not both.');
  if (options.apply && options.fixture) fail('fixture-apply-denied', '--fixture is local-only and cannot be combined with --apply.');
  return options;
}

export function publicProject(row) {
  const profile = relation(row.profiles), category = relation(row.portfolio_categories);
  return UUID.test(row.id) && UUID.test(row.profile_id) && profile?.id === row.profile_id
    && profile.is_private === false && row.is_hidden === false && category?.id === row.category_id
    && category.profile_id === row.profile_id && category.is_hidden === false;
}

function safeSourcePath(value, row) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('%') || value.includes(':') || /[\u0000-\u001f]/.test(value)) return false;
  const segments = value.split('/');
  return segments[0] === row.profile_id && segments.length >= 3 && segments.every(segment => segment && segment !== '.' && segment !== '..')
    && (segments[1] === row.id || (['pdf-pages', 'pdf-previews', 'video-previews'].includes(segments[1]) && segments[2] === row.id));
}

function safeRenderedPage(page, row, attachmentId) {
  if (page?.attachmentId !== attachmentId || typeof page.storagePath !== 'string') return false;
  if (safeSourcePath(page.storagePath, row)) return true;
  // The existing PDF worker uses this project-scoped namespace, not a profile
  // prefix. Anonymous Storage SELECT still independently checks project access.
  return page.storagePath.startsWith(`posts/${row.id}/pages/`)
    && page.storagePath.split('/').every(segment => /^[a-zA-Z0-9_.-]+$/.test(segment) && segment !== '.' && segment !== '..')
    && /\/page_[0-9]+\.webp$/.test(page.storagePath);
}

export async function planProject(row, { includeSocial = false } = {}) {
  if (!publicProject(row)) return { skip: 'not-public-visible' };
  if (row.cover_thumbnail != null && (!includeSocial || row.cover_thumbnail.social)) return { skip: 'already-has-thumbnail' };
  if (!UUID.test(row.revision)) return { skip: 'missing-revision' };
  const attachments = [...(row.project_attachments ?? [])].filter(attachment => attachment.project_id === row.id)
    .sort((left, right) => left.position - right.position);
  const cover = attachments.find(attachment => attachment.is_cover && attachment.storage_path)
    ?? attachments.find(attachment => attachment.kind === 'image' && attachment.storage_path) ?? attachments[0];
  if (!cover || !['image', 'document', 'video'].includes(cover.kind)) return { skip: 'no-supported-cover' };
  if (typeof cover.id !== 'string' || !cover.id || !safeSourcePath(cover.storage_path, row)) return { skip: 'invalid-source-path' };
  const metadata = cover.metadata && typeof cover.metadata === 'object' ? cover.metadata : {};
  const pageNumber = Number.isSafeInteger(metadata.coverPageNumber) && metadata.coverPageNumber > 0 ? metadata.coverPageNumber : 1;
  const sourceKey = await thumbnailSourceKey({ id: cover.id, storagePath: cover.storage_path, pageNumber, frame: metadata.coverFrame });
  // A completed, selected PDF page avoids reopening a large or multipart original.
  const rendered = cover.kind === 'document' && Array.isArray(metadata.renderedPages)
    ? metadata.renderedPages.find(page => page.withinDocumentIndex === pageNumber && safeRenderedPage(page, row, cover.id)) : null;
  if (metadata.multipart && !rendered) return { skip: 'multipart-source-needs-rendered-cover' };
  if (!rendered && cover.size_bytes > SOURCE_LIMIT) return { skip: 'source-over-256-mib' };
  const poster = cover.kind === 'video' && safeSourcePath(metadata.posterStoragePath, row) ? metadata.posterStoragePath : undefined;
  return {
    projectId: row.id, profileId: row.profile_id, revision: row.revision, sourceAttachmentId: cover.id, sourceKey,
    input: { kind: cover.kind, sourceUrl: rendered?.storagePath ?? cover.storage_path, posterUrl: poster, pageNumber,
      frame: metadata.coverFrame, aspectRatio: metadata.widthPixels > 0 && metadata.heightPixels > 0 ? metadata.widthPixels / metadata.heightPixels : undefined },
  };
}

/** Sequential, bounded work. Logs are audit evidence; database/object state decides resumption. */
export async function runBackfill(adapter, runtime, { apply = false, failFast = false, limit = Infinity, log = () => {} } = {}) {
  const started = Date.now();
  const summary = { mode: apply ? 'apply' : 'dry-run', failFast, stoppedOnFailure: false, considered: 0, eligible: 0, generated: 0, applied: 0, skipped: 0, failed: 0, bytes: 0 };
  await adapter.preflight();
  const bucket = await adapter.targetBucket();
  const includeSocial = await adapter.supportsSocial?.() === true;
  if (!['project-covers', 'project-media'].includes(bucket)) fail('invalid-bucket', 'No supported existing thumbnail bucket is available.');
  for await (const row of adapter.projects()) {
    if (summary.considered >= limit) break;
    summary.considered++;
    const projectStarted = Date.now();
    const context = { projectId: row.id, mode: summary.mode };
    const uploadedPaths = [];
    try {
      const plan = await planProject(row, { includeSocial });
      if (plan.skip) { summary.skipped++; await log({ ...context, status: 'skipped', reason: plan.skip }); continue; }
      summary.eligible++;
      await log({ ...context, status: 'started', kind: plan.input.kind, sourceKey: plan.sourceKey });
      const { variants, social } = includeSocial ? await renderCoverAssets(plan.input, runtime)
        : { variants: await renderCoverVariants(plan.input, runtime) };
      const hash = await thumbnailContentHash(variants, social);
      const assets = social ? [...variants, { ...social, size: 'social' }] : variants;
      const encoded = await Promise.all(assets.map(async variant => ({ ...variant,
        bytes: variant.blob instanceof Uint8Array ? variant.blob : new Uint8Array(await variant.blob.arrayBuffer()),
        path: `${plan.profileId}/${plan.projectId}/${hash}/${variant.size}.webp`,
      })));
      summary.generated++;
      const bytes = encoded.reduce((total, variant) => total + variant.bytes.byteLength, 0);
      summary.bytes += bytes;
      const manifest = { version: 1, bucket, sourceAttachmentId: plan.sourceAttachmentId, sourceKey: plan.sourceKey, frameBaked: true,
        variants: encoded.filter(item => item.size !== 'social').map(({ size, path: objectPath, width, height }) => ({ size, path: objectPath, width, height })),
        ...(social ? { social: { path: encoded.find(item => item.size === 'social').path, width: 1200, height: 630 } } : {}) };
      if (apply) {
        // Anonymous, fresh reads close the gap between a queued row and a creator edit.
        const assertCurrent = async () => {
          const fresh = await adapter.currentProject(plan.projectId);
          const current = fresh ? await planProject(fresh, { includeSocial }) : { skip: 'not-public-visible' };
          if (current.skip || current.revision !== plan.revision || current.sourceKey !== plan.sourceKey) fail('project-changed', 'Visibility, cover, revision or thumbnail changed; this project was not updated.');
        };
        for (const variant of encoded) {
          await assertCurrent();
          if (await adapter.objectExists(bucket, variant.path)) {
            await log({ ...context, status: 'reused-object', size: variant.size, path: variant.path });
          } else {
            await adapter.upload(bucket, variant.path, variant.bytes);
            uploadedPaths.push(variant.path);
            await log({ ...context, status: 'uploaded', size: variant.size, path: variant.path, bytes: variant.bytes.byteLength });
          }
        }
        await assertCurrent();
        await adapter.persist(plan.projectId, plan.revision, manifest);
        summary.applied++;
      }
      await log({ ...context, status: apply ? 'completed' : 'would-write', sourceKey: plan.sourceKey, bucket, variants: manifest.variants, social: manifest.social,
        bytes, elapsedMs: Date.now() - projectStarted });
    } catch (error) {
      summary.failed++;
      if (apply && bucket === 'project-covers' && uploadedPaths.length) {
        // A concurrent winning publication can now reference this same content
        // hash. Deleting after a read would race it; retain for retry or the
        // application's guarded whole-prefix hide/delete cleanup instead.
        await log({ ...context, status: 'retained-public-uploads', paths: uploadedPaths,
          message: 'Immutable variants are retained for safe retry or guarded visibility cleanup; a concurrent publication may reference them.' });
      }
      await log({ ...context, status: 'failed', ...safeError(error), elapsedMs: Date.now() - projectStarted });
      if (failFast) {
        summary.stoppedOnFailure = true;
        break;
      }
    }
  }
  return { ...summary, elapsedMs: Date.now() - started };
}

function bounded(bytes) {
  if (bytes.byteLength > SOURCE_LIMIT) fail('source-too-large', 'This source exceeds the 256 MiB backfill memory limit. Use its processed cover page or a bounded media worker.');
  return bytes;
}

/** Uses the existing pdfjs-dist optional native canvas; does not install anything. */
export async function createNodeRuntime(readSource, { ffmpeg = 'ffmpeg' } = {}) {
  let native;
  try { native = await import('@napi-rs/canvas'); }
  catch { fail('canvas-unavailable', 'The existing PDF.js optional @napi-rs/canvas runtime is unavailable. Prepare a compatible runtime before applying the backfill.'); }
  const createCanvas = native.createCanvas;
  const loadImage = async source => {
    const image = await native.loadImage(bounded(await readSource(source)));
    return { source: image, width: image.width, height: image.height };
  };
  const renderPdfPage = async (source, pageNumber, maxLongEdge) => {
    const bytes = bounded(await readSource(source));
    if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
      const image = await native.loadImage(bytes); // Already-rendered selected document page.
      return { source: image, width: image.width, height: image.height };
    }
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, useWorkerFetch: false });
    try {
      const document = await task.promise;
      if (pageNumber > document.numPages) fail('invalid-cover-page', 'The selected cover page is outside the source PDF.');
      const page = await document.getPage(pageNumber), base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxLongEdge / Math.max(base.width, base.height) });
      const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return { source: canvas, width: canvas.width, height: canvas.height, dispose: () => task.destroy() };
    } catch (error) { await task.destroy(); throw error; }
  };
  const loadVideoFrame = async source => {
    const directory = await mkdtemp(path.join(tmpdir(), 'portalink-cover-'));
    const input = path.join(directory, 'source.bin');
    try {
      await writeFile(input, bounded(await readSource(source)));
      const png = await new Promise((resolve, reject) => {
        const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', input, '-frames:v', '1', '-vf', 'scale=2400:2400:force_original_aspect_ratio=decrease', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks = []; let total = 0;
        const timer = setTimeout(() => { child.kill(); reject(new BackfillError('video-timeout', 'Video frame extraction exceeded 60 seconds.')); }, 60_000);
        child.once('error', () => { clearTimeout(timer); reject(new BackfillError('ffmpeg-unavailable', 'A video without a stored poster needs an existing ffmpeg executable. Set --ffmpeg or FFMPEG_PATH before retrying.')); });
        child.stdout.on('data', chunk => { total += chunk.length; if (total > 32 * 1024 * 1024) { child.kill(); reject(new BackfillError('video-frame-too-large', 'Video frame extraction exceeded its output limit.')); } else chunks.push(chunk); });
        child.once('close', code => { clearTimeout(timer); if (code === 0 && total) resolve(Buffer.concat(chunks)); else reject(new BackfillError('video-decode-failed', 'The video frame could not be decoded with the configured ffmpeg.')); });
      });
      const image = await native.loadImage(png);
      return { source: image, width: image.width, height: image.height };
    } finally {
      await unlink(input).catch(() => {});
      await rmdir(directory).catch(() => {});
    }
  };
  return { loadImage, renderPdfPage, loadVideoFrame, createCanvas, encodeWebp: async canvas => new Blob([await canvas.encode('webp', 82)], { type: 'image/webp' }) };
}

export async function createFixtureAdapter(fixturePath) {
  const resolved = await realpath(path.resolve(fixturePath));
  const directory = path.dirname(resolved);
  const fixture = JSON.parse(await readFile(resolved, 'utf8'));
  const noWrite = () => fail('fixture-write-denied', 'Fixture adapters cannot write Storage or database records.');
  return {
    preflight: async () => {}, targetBucket: async () => fixture.bucket ?? 'project-media', supportsSocial: async () => fixture.social === true,
    async *projects() { for (const row of fixture.projects ?? []) yield row; },
    async readSource(source) {
      const relative = fixture.files?.[source];
      if (typeof relative !== 'string' || path.isAbsolute(relative)) fail('fixture-path-denied', 'Fixture sources must be explicitly mapped to local relative files.');
      const file = await realpath(path.resolve(directory, relative));
      if (!file.startsWith(`${directory}${path.sep}`)) fail('fixture-path-denied', 'Fixture sources must remain inside the fixture directory.');
      if ((await stat(file)).size > SOURCE_LIMIT) fail('source-too-large', 'The fixture source exceeds the memory limit.');
      return new Uint8Array(await readFile(file));
    },
    currentProject: noWrite, objectExists: noWrite, upload: noWrite, persist: noWrite,
  };
}

export async function createSupabaseAdapter(environment) {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = environment;
  if (!url || !anonKey || !serviceKey) fail('environment-required', 'Live inspection requires explicitly supplied SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. No .env file is loaded. Use --fixture for offline verification.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('invalid-service-url', 'SUPABASE_URL must be an HTTPS service origin.');
  const { createClient } = await import('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const publicClient = createClient(url, anonKey, options), serviceClient = createClient(url, serviceKey, options);
  const projectQuery = () => publicClient.from('projects').select(SELECT)
    .eq('is_hidden', false).eq('profiles.is_private', false).eq('portfolio_categories.is_hidden', false);
  const check = (error, code, message) => { if (error) fail(code, message); };
  return {
    async supportsSocial() {
      const { data, error } = await serviceClient.rpc('project_cover_social_supported');
      if (error && (error.code === 'PGRST202' || error.code === '42883')) return false;
      check(error, 'capability-read-failed', 'Could not verify social-cover support; no uploads were attempted.');
      return data === true;
    },
    async preflight() {
      const { error } = await publicClient.from('projects').select('id,cover_thumbnail').limit(1);
      check(error, 'schema-unavailable', 'The cover-thumbnail schema is unavailable. Apply the separately reviewed thumbnail SQL before a live backfill; no uploads were attempted.');
    },
    async targetBucket() {
      const { data, error } = await serviceClient.storage.getBucket('project-covers');
      if (!error) {
        if (data.public !== true) fail('bucket-configuration', 'The existing project-covers bucket is not public; stop and review its configuration.');
        return 'project-covers';
      }
      if (String(error.statusCode) !== '404' && !/not found/i.test(error.message)) fail('bucket-inspection-failed', 'Could not verify the existing thumbnail bucket; no uploads were attempted.');
      const fallback = await serviceClient.storage.getBucket('project-media');
      check(fallback.error, 'bucket-unavailable', 'The existing private project-media bucket could not be verified.');
      if (fallback.data.public) fail('bucket-configuration', 'The fallback project-media bucket must remain private.');
      return 'project-media';
    },
    async *projects() {
      // Include older three-file manifests so an approved capability can upgrade them.
      let after = null;
      for (;;) {
        let query = projectQuery().order('id').limit(100);
        if (after) query = query.gt('id', after);
        const { data, error } = await query;
        check(error, 'project-read-failed', 'Could not read the anonymous-visible projects. No private records are eligible.');
        for (const row of data ?? []) yield row;
        if (!data?.length || data.length < 100) break;
        after = data.at(-1).id;
      }
    },
    async currentProject(id) {
      const { data, error } = await projectQuery().eq('id', id).maybeSingle();
      check(error, 'visibility-read-failed', 'Could not recheck public visibility; this project was not updated.');
      return data;
    },
    async readSource(source) {
      const { data, error } = await publicClient.storage.from('project-media').download(source);
      check(error, 'source-unavailable', 'The original or rendered page is unavailable through anonymous Storage permissions.');
      if (data.size > SOURCE_LIMIT) fail('source-too-large', 'The source exceeds the 256 MiB memory limit.');
      return new Uint8Array(await data.arrayBuffer());
    },
    async objectExists(bucket, objectPath) {
      const { data, error } = await serviceClient.storage.from(bucket).exists(objectPath);
      check(error, 'object-inspection-failed', 'Could not verify the thumbnail object before upload.');
      return data;
    },
    async upload(bucket, objectPath, bytes) {
      const publicCover = bucket === 'project-covers';
      const { error } = await serviceClient.storage.from(bucket).upload(objectPath, bytes, {
        contentType: 'image/webp', cacheControl: publicCover ? '31536000' : '3600', upsert: false,
        headers: { 'cache-control': publicCover ? 'public, max-age=31536000, immutable' : 'private, max-age=3600' },
      });
      check(error, 'upload-failed', 'Thumbnail upload failed. Existing objects were not overwritten; retry this project to resume.');
    },
    async persist(id, revision, manifest) {
      const { error } = await serviceClient.rpc('set_project_cover_thumbnail', { p_project_id: id, p_expected_revision: revision, p_manifest: manifest });
      check(error, 'persist-failed', 'The thumbnail setter rejected this project. Verify the reviewed SQL, public visibility and unchanged revision, then retry. Uploaded immutable variants can be reused.');
    },
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log('Usage: node scripts/backfill-cover-thumbnails.mjs [--dry-run | --apply] [--fail-fast] [--fixture [file.json]] [--limit N] [--log file.jsonl] [--ffmpeg existing-executable]');
    return { help: true };
  }
  // This branch happens before environment access or construction of network clients.
  const adapter = options.fixture ? await createFixtureAdapter(options.fixture) : await createSupabaseAdapter(process.env);
  const runtime = await createNodeRuntime(adapter.readSource, { ffmpeg: options.ffmpeg || (!options.fixture ? process.env.FFMPEG_PATH : undefined) });
  const logPath = path.resolve(options.log);
  await mkdir(path.dirname(logPath), { recursive: true });
  const log = async event => {
    await appendFile(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8');
    console.log(JSON.stringify(event));
  };
  const summary = await runBackfill(adapter, runtime, { ...options, log });
  await log({ status: 'summary', fixture: Boolean(options.fixture), ...summary });
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(summary => { if (summary.failed) process.exitCode = 1; }).catch(error => {
    console.error(JSON.stringify({ status: 'stopped', ...safeError(error) })); process.exitCode = 1;
  });
}
