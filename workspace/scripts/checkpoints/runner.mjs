// Fixed-purpose Windows checkpoint observer. No application scripts or source Git writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REMOTE = 'https://github.com/avimangalmurti-art/Portalink.git';
export const BRANCH = 'autosave/thinkpad';
const REF = `refs/heads/${BRANCH}`;
const ZERO = '0'.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const slash = name => name.replaceAll('\\', '/');
const nul = bytes => bytes.toString('utf8').split('\0').filter(Boolean);
const exists = async name => fs.lstat(name).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
const digestFile = async name => await exists(name) ? sha(await fs.readFile(name)) : null;
const readJson = async name => JSON.parse(await fs.readFile(name, 'utf8'));
const safeMessage = e => e instanceof CheckpointError ? e.message : 'Checkpoint could not finish. Check file availability and the installed configuration.';
export class CheckpointError extends Error {}

export function validateRelative(name) {
  if (!name || name.includes('\\') || /[\x00-\x1f\x7f:]/u.test(name) || path.posix.isAbsolute(name)
    || name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) {
    throw new CheckpointError('An unsupported or unsafe project path blocked capture.');
  }
  return name;
}

export function excludedPath(name) {
  const parts = name.toLowerCase().split('/');
  const base = parts.at(-1);
  if (parts.some(p => ['.git', '.codex', '.claude', '.agents', '.aws', '.azure', '.ssh', '.gnupg', '.kube', '.terraform',
    '.sites-runtime', '.vercel', '.wrangler', '.expo', '.gradle', '.venv', 'node_modules',
    '__pycache__', 'pods', 'deriveddata', 'dist', 'dist-ssr', 'credentials', 'secrets'].includes(p))) return true;
  if (parts.some(p => p.startsWith('.env') && p !== '.env.example')) return true;
  return /(?:^|[._-])(credentials?|secrets?|service[-_]?account)(?:[._-]|$)/i.test(base)
    || /^(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.|$)/.test(base)
    || /\.(?:local|key|pem|p12|pfx|p8|jks|keystore|mobileprovision|provisionprofile|cer|crt|kdbx|log)$/i.test(base)
    || /^(?:\.npmrc|\.netrc|\.pypirc|\.git-credentials|claude\.local\.md|google-services\.json|googleservice-info\.plist|key\.properties)$/i.test(base);
}

function acceptableBytes(name, bytes) {
  if (/\.(zip|7z|rar|tar|gz|bz2|xz|sqlite|sqlite3|db|dump|bak|exe|dll|so|dylib|apk|aab|ipa)$/i.test(name)) {
    throw new CheckpointError(`Archive, database, or executable requires review: ${name}`);
  }
  if (isUtf8(bytes) && !bytes.includes(0)) {
    const text = bytes.toString('utf8');
    if (/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)
      || /sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) throw new CheckpointError(`Sensitive key material blocked: ${name}`);
    for (const token of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      let payload;
      try { payload = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8')); } catch { continue; }
      if (payload.role === 'service_role') throw new CheckpointError(`Supabase server credential blocked: ${name}`);
    }
    return;
  }
  const ext = path.extname(name).toLowerCase();
  const valid = (['.jpg', '.jpeg'].includes(ext) && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    || (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (ext === '.ico' && bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])))
    || (ext === '.gif' && /^GIF8[79]a/.test(bytes.subarray(0, 6).toString()))
    || (ext === '.webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP')
    || (['.mp4', '.mov'].includes(ext) && bytes.subarray(4, 8).toString() === 'ftyp')
    || (ext === '.woff' && bytes.subarray(0, 4).toString() === 'wOFF')
    || (ext === '.woff2' && bytes.subarray(0, 4).toString() === 'wOF2')
    || (ext === '.ttf' && bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])));
  if (!valid) throw new CheckpointError(`Unsupported binary requires review: ${name}`);
}

function commandEnv(isolated = true) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(GIT_|GCM_|SSH_|NODE_OPTIONS$|NODE_EXTRA_CA_CERTS$)/i.test(key)) delete env[key];
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_OPTIONAL_LOCKS: '0' });
  if (isolated) Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' });
  return env;
}

function execute(executable, args, options = {}) {
  const r = spawnSync(executable, args, { windowsHide: true, shell: false, timeout: 60_000,
    maxBuffer: 128 * 1024 * 1024, env: commandEnv(), ...options });
  if (r.error || r.signal) throw new CheckpointError('A checkpoint command timed out or could not start.');
  return r;
}

export function git(config, args, { source = false, input, allow = [0], extraEnv = {} } = {}) {
  const base = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'core.hooksPath=' + path.join(config.storeRoot, 'empty-hooks'), '-c', 'maintenance.auto=false',
    '-c', 'gc.auto=0', '-c', 'core.logAllRefUpdates=false', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false'];
  if (source) base.push('-c', `safe.directory=${slash(config.sourceRoot)}`, '-C', config.sourceRoot);
  else base.push(`--git-dir=${path.join(config.storeRoot, 'checkpoint.git')}`);
  const env = { ...commandEnv(), ...extraEnv };
  // Exclude rules may be user-configured. Read their path without executing hooks/filters.
  if (source && config.excludesFile) base.unshift('-c', `core.excludesFile=${config.excludesFile}`);
  const r = execute(config.gitPath, [...base, ...args], { input, env });
  if (!allow.includes(r.status)) throw new CheckpointError(`Git ${args[0]} failed; no working files were changed.`);
  return r;
}

async function atomicJson(name, value) {
  const tmp = name + '.' + randomUUID() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await fs.rename(tmp, name);
}

async function noLinkEscape(root, relative) {
  const resolvedRoot = await fs.realpath(root);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current, { bigint: true });
    if (stat.isSymbolicLink()) throw new CheckpointError(`Symbolic link/junction blocked: ${relative}`);
    const actual = await fs.realpath(current);
    const rel = path.relative(resolvedRoot, actual);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new CheckpointError('Project path escaped the working folder.');
  }
}

async function sourceState(config) {
  const get = args => git(config, args, { source: true }).stdout.toString('utf8').trim();
  const gitDir = get(['rev-parse', '--absolute-git-dir']);
  for (const marker of ['index.lock', 'HEAD.lock', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-apply', 'rebase-merge', 'sequencer']) {
    if (await exists(path.join(gitDir, marker))) throw new CheckpointError('Git is busy with another operation; capture will retry.');
  }
  if (git(config, ['ls-files', '-u', '-z'], { source: true }).stdout.length) throw new CheckpointError('Resolve Git conflicts before checkpointing.');
  return { head: get(['rev-parse', 'HEAD']), branch: get(['rev-parse', '--abbrev-ref', 'HEAD']),
    index: await digestFile(path.join(gitDir, 'index')) };
}

async function inventory(config) {
  const candidates = [...new Set(nul(git(config, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { source: true }).stdout))].sort();
  candidates.forEach(validateRelative);
  const ignored = new Set(nul(git(config, ['check-ignore', '--no-index', '--stdin', '-z'], {
    source: true, input: candidates.length ? candidates.join('\0') + '\0' : '', allow: [0, 1],
  }).stdout));
  const eligible = candidates.filter(p => !ignored.has(p) && !excludedPath(p));
  const casePaths = new Set();
  for (const p of eligible) {
    if (casePaths.has(p.toLowerCase())) throw new CheckpointError('Case-colliding paths require review.');
    casePaths.add(p.toLowerCase());
  }
  return { eligible, excludedCount: candidates.length - eligible.length };
}

// OneDrive hydration can alter ctime/attributes while leaving bytes unchanged.
// Size/mtime/identity plus the independent second content hash establish stability.
function signature(stat) { return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}`; }

export async function capture(config, policy, destination, afterCapture) {
  const before = await sourceState(config);
  const inv = await inventory(config);
  if (inv.eligible.length > policy.maxFiles) throw new CheckpointError('Project exceeds the approved checkpoint file limit.');
  let total = 0;
  const files = [];
  const absent = [];
  for (const relative of inv.eligible) {
    const original = path.join(config.sourceRoot, relative);
    if (!await exists(original)) { absent.push(relative); continue; } // Tracked deletions are represented by absence.
    await noLinkEscape(config.sourceRoot, relative);
    const pre = await fs.lstat(original, { bigint: true });
    if (!pre.isFile()) throw new CheckpointError(`Nested repository or non-file requires review: ${relative}`);
    if (pre.size > BigInt(policy.maxFileBytes)) throw new CheckpointError(`File exceeds checkpoint limit: ${relative}`);
    const bytes = await fs.readFile(original);
    await noLinkEscape(config.sourceRoot, relative);
    const post = await fs.lstat(original, { bigint: true });
    if (signature(pre) !== signature(post) || bytes.length !== Number(post.size)) throw new CheckpointError(`Project changed during capture: ${relative}; retrying later.`);
    total += bytes.length;
    if (total > policy.maxSnapshotBytes) throw new CheckpointError('Project exceeds the approved checkpoint size limit.');
    acceptableBytes(relative, bytes);
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
    files.push({ path: relative, sha256: sha(bytes), size: bytes.length, mode: Number(post.mode) & 0o111 ? '100755' : '100644' });
  }
  if (afterCapture) await afterCapture(); // Injectable only through module API for isolated tests.
  if (JSON.stringify(inv) !== JSON.stringify(await inventory(config))) throw new CheckpointError('Project file list changed during capture; retrying later.');
  for (const relative of absent) if (await exists(path.join(config.sourceRoot, relative))) throw new CheckpointError('Project changed during capture; retrying later.');
  for (const file of files) {
    await noLinkEscape(config.sourceRoot, file.path);
    if (await digestFile(path.join(config.sourceRoot, file.path)) !== file.sha256) throw new CheckpointError(`Project changed during capture: ${file.path}; retrying later.`);
  }
  if (JSON.stringify(before) !== JSON.stringify(await sourceState(config))) throw new CheckpointError('Source branch or staging changed during capture; retrying later.');
  return { ...before, files, excludedCount: inv.excludedCount, payloadHash: sha(JSON.stringify(files)) };
}

export async function scanWithGitleaks(config, policy, directory) {
  if (await digestFile(config.scannerPath) !== policy.scannerSha256) throw new CheckpointError('Secret scanner integrity check failed.');
  const report = path.join(path.dirname(directory), 'scan-' + randomUUID() + '.json');
  const scannerConfig = path.join(config.storeRoot, 'scanner.toml');
  await fs.writeFile(scannerConfig, '[extend]\nuseDefault = true\n');
  const env = commandEnv();
  for (const key of Object.keys(env)) if (key.startsWith('GITLEAKS_')) delete env[key];
  const r = execute(config.scannerPath, ['dir', directory, '--no-banner', '--redact=100', '--config', scannerConfig,
    '--gitleaks-ignore-path', path.join(config.storeRoot, 'empty-scanner-ignore'), '--ignore-gitleaks-allow',
    '--max-target-megabytes', '96', '--max-archive-depth', '0', '--max-decode-depth', '2',
    '--report-format', 'json', '--report-path', report], { env, cwd: config.storeRoot, timeout: 90_000 });
  try {
    if (![0, 1].includes(r.status)) throw new CheckpointError('Secret scanner failed; upload blocked.');
    const findings = await exists(report) ? await readJson(report) : [];
    if (!Array.isArray(findings) || (r.status === 1 && !findings.length)) throw new CheckpointError('Secret scanner produced an invalid result; upload blocked.');
    const blocked = [];
    for (const finding of findings) {
      const absolute = path.isAbsolute(finding.File) ? finding.File : path.join(directory, finding.File);
      const relative = slash(path.relative(directory, absolute));
      validateRelative(relative);
      // Exact file bytes, rule and line are required for a reviewed synthetic fixture exception.
      const hash = await digestFile(absolute);
      const allowed = policy.approvedFindings.some(a => a.path === relative && a.rule === finding.RuleID
        && a.line === finding.StartLine && a.sha256 === hash);
      if (!allowed) blocked.push({ path: relative, rule: finding.RuleID, line: finding.StartLine, sha256: hash });
    }
    if (blocked.length) {
      await atomicJson(path.join(config.storeRoot, 'blocked-findings.json'), blocked);
      throw new CheckpointError(`Secret scan blocked ${blocked.length} finding(s). See local blocked-findings.json (no secret values).`);
    }
  } finally { await fs.rm(report, { force: true }); }
}

async function initializeStore(config) {
  const directory = path.join(config.storeRoot, 'checkpoint.git');
  if (!await exists(directory)) {
    const r = execute(config.gitPath, ['-c', 'core.hooksPath=' + path.join(config.storeRoot, 'empty-hooks'), 'init', '--bare', directory]);
    if (r.status !== 0) throw new CheckpointError('Could not initialize private checkpoint storage.');
  }
}

function tip(config) {
  const r = git(config, ['rev-parse', '--verify', REF], { allow: [0, 128] });
  return r.status === 0 ? r.stdout.toString().trim() : null;
}

async function writeCommit(config, snapshot, directory, parent) {
  const index = path.join(config.storeRoot, 'snapshot.index');
  await fs.rm(index, { force: true });
  const extraEnv = { GIT_INDEX_FILE: index };
  git(config, ['read-tree', '--empty'], { extraEnv });
  const records = [];
  const add = async (name, bytes, mode = '100644') => {
    const oid = git(config, ['hash-object', '-w', '--no-filters', '--stdin'], { input: bytes }).stdout.toString().trim();
    records.push(`${mode} ${oid}\t${name}\0`);
  };
  for (const file of snapshot.files) {
    const bytes = await fs.readFile(path.join(directory, file.path));
    if (sha(bytes) !== file.sha256) throw new CheckpointError('Private capture changed after scanning; commit blocked.');
    await add(`workspace/${file.path}`, bytes, file.mode);
  }
  const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), sourceHead: snapshot.head,
    sourceBranch: snapshot.branch, payloadHash: snapshot.payloadHash, files: snapshot.files,
    excludedCount: snapshot.excludedCount, purpose: 'Unfinished saved files; not a release. Export workspace/ for recovery.' };
  await add('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  await add('README.md', Buffer.from('# Portalink ThinkPad checkpoints\n\nBackup-only branch. Never merge or deploy it. Files are under workspace/.\nExport to a separate recovery folder, review changes, and deliberately integrate tested work through a normal development branch.\nIgnored files and credentials are not backed up.\n'));
  git(config, ['update-index', '-z', '--index-info'], { input: records.join(''), extraEnv });
  const tree = git(config, ['write-tree'], { extraEnv }).stdout.toString().trim();
  const commit = git(config, ['commit-tree', tree, ...(parent ? ['-p', parent] : [])], {
    input: `Checkpoint saved work [skip ci]\n`, extraEnv: { ...extraEnv,
      GIT_AUTHOR_NAME: 'Portalink Checkpoint', GIT_AUTHOR_EMAIL: 'checkpoint@localhost',
      GIT_COMMITTER_NAME: 'Portalink Checkpoint', GIT_COMMITTER_EMAIL: 'checkpoint@localhost' },
  }).stdout.toString().trim();
  git(config, ['update-ref', REF, commit, parent ?? ZERO]);
  await fs.rm(index, { force: true });
  return { commit, createdAt: manifest.createdAt };
}

export async function publishCheckpoint(config, localTip) {
  if (config.remoteUrl !== REMOTE || config.branch !== BRANCH) throw new CheckpointError('Checkpoint destination does not match the approved repository and branch.');
  const options = ['-c', 'credential.helper=', '-c', `credential.helper=!"${slash(config.credentialHelperPath)}"`,
    '-c', 'credential.useHttpPath=false', '-c', 'http.followRedirects=false'];
  const remoteTip = () => {
    const r = git(config, [...options, 'ls-remote', '--refs', REMOTE, REF]);
    const text = r.stdout.toString().trim();
    if (!text) return null;
    if (!/^[a-f0-9]{40}\trefs\/heads\/autosave\/thinkpad$/.test(text)) throw new CheckpointError('Unexpected checkpoint remote response.');
    return text.split('\t')[0];
  };
  const remote = remoteTip();
  if (remote === localTip) return;
  if (remote && git(config, ['merge-base', '--is-ancestor', remote, localTip], { allow: [0, 1, 128] }).status !== 0) {
    throw new CheckpointError('Remote checkpoint history differs. Upload paused; preserve both histories and review.');
  }
  git(config, [...options, 'push', '--porcelain', '--no-verify', '--no-follow-tags', REMOTE, `${REF}:${REF}`]);
  if (remoteTip() !== localTip) throw new CheckpointError('Upload acknowledgment could not be verified; the next run will retry.');
}

async function scanOutgoing(config, policy, localTip, lastRemote, scan) {
  const cachePath = path.join(config.storeRoot, 'scan-cache.json');
  const policyHash = sha(JSON.stringify(policy));
  const saved = await exists(cachePath) ? await readJson(cachePath) : null;
  const cache = saved?.policyHash === policyHash ? saved : { policyHash, commits: [] };
  const commits = nul(git(config, ['rev-list', '--reverse', localTip, ...(lastRemote ? ['^' + lastRemote] : [] )]).stdout.toString().replaceAll('\n', '\0'));
  for (const commit of commits) {
    if (cache.commits.includes(commit)) continue;
    const manifest = JSON.parse(git(config, ['show', `${commit}:manifest.json`]).stdout.toString());
    const directory = path.join(config.storeRoot, 'outgoing-' + randomUUID());
    await fs.mkdir(directory, { mode: 0o700 });
    try {
      for (const file of manifest.files) {
        validateRelative(file.path);
        if (excludedPath(file.path)) throw new CheckpointError('Queued checkpoint contains a now-excluded path; review required.');
        const bytes = git(config, ['show', `${commit}:workspace/${file.path}`]).stdout;
        if (sha(bytes) !== file.sha256) throw new CheckpointError('Queued checkpoint failed integrity verification.');
        const target = path.join(directory, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes, { mode: 0o600 });
      }
      await scan(config, policy, directory);
      cache.commits.push(commit);
      await atomicJson(cachePath, cache);
    } finally { await removePrivateCapture(config, directory); }
  }
}

async function removePrivateCapture(config, directory) {
  const root = await fs.realpath(config.storeRoot);
  const actual = await fs.realpath(directory);
  if (path.dirname(actual) !== root || !/^(capture|outgoing)-[a-f0-9-]+$/.test(path.basename(actual))) {
    throw new CheckpointError('Refusing to remove a path outside private checkpoint storage.');
  }
  await fs.rm(actual, { recursive: true, force: true });
}

async function validateStorage(config) {
  const source = await fs.realpath(config.sourceRoot);
  const storage = path.resolve(config.storeRoot);
  let ancestor = storage;
  while (!await exists(ancestor)) ancestor = path.dirname(ancestor);
  let check = ancestor;
  while (true) {
    if ((await fs.lstat(check)).isSymbolicLink()) throw new CheckpointError('Redirected checkpoint storage is not allowed.');
    if (path.dirname(check) === check) break;
    check = path.dirname(check);
  }
  const actual = path.resolve(await fs.realpath(ancestor), path.relative(ancestor, storage));
  const isInside = (a, b) => { const rel = path.relative(a, b); return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep); };
  if (isInside(source, actual) || isInside(actual, source)) throw new CheckpointError('Checkpoint storage must be outside the working project.');
}

export async function runCheckpoint(config, { scan = scanWithGitleaks, publish = publishCheckpoint, afterCapture } = {}) {
  if (config.remoteUrl !== REMOTE || config.branch !== BRANCH) throw new CheckpointError('Invalid checkpoint destination.');
  await validateStorage(config);
  await fs.mkdir(config.storeRoot, { recursive: true, mode: 0o700 });
  const lock = path.join(config.storeRoot, 'run.lock');
  try { await fs.mkdir(lock); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let owner;
    try { owner = await readJson(path.join(lock, 'owner.json')); } catch { /* incomplete lock */ }
    let alive = false;
    if (Number.isInteger(owner?.pid)) try { process.kill(owner.pid, 0); alive = true; } catch (e) { alive = e.code !== 'ESRCH'; }
    if (alive || Date.now() - (await fs.stat(lock)).mtimeMs < 5 * 60_000) return { state: 'busy' };
    // Only the installed Windows launcher holds the OS mutex across stale cleanup.
    // Library/test callers cannot race stale cleanup; they must resolve it explicitly.
    if (!config.serializedRun) throw new CheckpointError('Stale checkpoint lock requires a serialized Windows task run.');
    await fs.rm(path.join(lock, 'owner.json'), { force: true });
    await fs.rmdir(lock);
    return { state: 'stale-lock-cleared' }; // Next interval retries without racing another observer.
  }
  await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }));
  const statusPath = path.join(config.storeRoot, 'status.json');
  let status = await exists(statusPath) ? await readJson(statusPath) : {};
  const captureDir = path.join(config.storeRoot, 'capture-' + randomUUID());
  try {
    status = { ...status, lastAttemptAt: new Date().toISOString(), state: 'running', error: null };
    await atomicJson(statusPath, status);
    const policy = await readJson(config.policyPath);
    await fs.mkdir(captureDir, { mode: 0o700 });
    const snapshot = await capture(config, policy, captureDir, afterCapture);
    await scan(config, policy, captureDir);
    await initializeStore(config);
    let localTip = tip(config);
    const previous = localTip ? JSON.parse(git(config, ['show', `${localTip}:manifest.json`]).stdout.toString()) : null;
    // Avoid creating an initial checkpoint when all eligible files match the working index.
    const changedNames = previous ? [] : [
      ...nul(git(config, ['ls-files', '-m', '-d', '-o', '--exclude-standard', '-z'], { source: true }).stdout),
      ...nul(git(config, ['diff-index', '--cached', '--name-only', '--no-ext-diff', '-z', 'HEAD'], { source: true }).stdout),
    ];
    changedNames.forEach(validateRelative);
    const ignoredChanges = new Set(nul(git(config, ['check-ignore', '--no-index', '--stdin', '-z'], {
      source: true, input: changedNames.length ? changedNames.join('\0') + '\0' : '', allow: [0, 1],
    }).stdout));
    const eligibleChange = changedNames.some(name => !excludedPath(name) && !ignoredChanges.has(name));
    if ((!previous && eligibleChange) || (previous && previous.payloadHash !== snapshot.payloadHash)) {
      const result = await writeCommit(config, snapshot, captureDir, localTip);
      localTip = result.commit;
      status.lastLocalAt = result.createdAt;
      const cachePath = path.join(config.storeRoot, 'scan-cache.json');
      const policyHash = sha(JSON.stringify(policy));
      const saved = await exists(cachePath) ? await readJson(cachePath) : null;
      const cache = saved?.policyHash === policyHash ? saved : { policyHash, commits: [] };
      cache.commits.push(localTip); // Exact captured bytes were scanned and verified before Git writes.
      await atomicJson(cachePath, cache);
    }
    status.lastLocalCommit = localTip;
    status.excludedCount = snapshot.excludedCount;
    status.fileCount = snapshot.files.length;
    if (localTip && config.remoteEnabled && status.lastRemoteCommit !== localTip) {
      await scanOutgoing(config, policy, localTip, status.lastRemoteCommit, scan);
      await publish(config, localTip);
      status.lastRemoteCommit = localTip;
      status.lastRemoteAt = new Date().toISOString();
      await atomicJson(path.join(config.storeRoot, 'scan-cache.json'), { policyHash: sha(JSON.stringify(policy)), commits: [localTip] });
    }
    status.state = localTip && status.lastRemoteCommit !== localTip ? 'local-only' : 'ok';
    await atomicJson(statusPath, status);
    return status;
  } catch (e) {
    status = { ...status, state: 'blocked', error: safeMessage(e) };
    await atomicJson(statusPath, status);
    return status;
  } finally {
    if (await exists(captureDir)) await removePrivateCapture(config, captureDir);
    await fs.rm(path.join(lock, 'owner.json'), { force: true });
    await fs.rmdir(lock);
  }
}

export async function verifyInstalled(config) {
  if (config.schemaVersion !== 1 || config.remoteUrl !== REMOTE || config.branch !== BRANCH) throw new CheckpointError('Invalid installed checkpoint configuration.');
  const expectedRoot = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'Portalink', 'Checkpoints');
  if (path.resolve(config.storeRoot).toLowerCase() !== path.resolve(expectedRoot).toLowerCase()) throw new CheckpointError('Unexpected private checkpoint storage location.');
  if (path.resolve(config.integrityPath) !== path.join(config.storeRoot, 'integrity.json')) throw new CheckpointError('Unexpected integrity file location.');
  for (const target of [config.storeRoot, config.integrityPath, config.policyPath, config.scannerPath, config.gitPath, config.nodePath, config.credentialHelperPath]) {
    let current = path.resolve(target);
    while (true) {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new CheckpointError('Redirected installation path blocked.');
      if (path.dirname(current) === current) break;
      current = path.dirname(current);
    }
  }
  const programFiles = process.env.ProgramFiles;
  for (const executable of [config.gitPath, config.nodePath, config.credentialHelperPath]) {
    if (!path.relative(programFiles, executable) || path.relative(programFiles, executable).startsWith('..') || path.isAbsolute(path.relative(programFiles, executable))) {
      throw new CheckpointError('Checkpoint executables must use the trusted system installation.');
    }
  }
  const integrity = await readJson(config.integrityPath);
  for (const name of ['runner.mjs', 'policy.json', 'gitleaks.exe']) {
    if (await digestFile(path.join(config.storeRoot, 'bin', name)) !== integrity.files[name]) throw new CheckpointError('Installed checkpoint files changed. Review and reinstall before running.');
  }
  if (path.resolve(config.policyPath) !== path.join(config.storeRoot, 'bin', 'policy.json')
    || path.resolve(config.scannerPath) !== path.join(config.storeRoot, 'bin', 'gitleaks.exe')) throw new CheckpointError('Unexpected checkpoint policy/scanner path.');
  const excludes = execute(config.gitPath, ['-C', config.sourceRoot, 'config', '--path', '--get', 'core.excludesFile'], { env: commandEnv(false) });
  if (excludes.status === 0) config.excludesFile = excludes.stdout.toString().trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--config') throw new CheckpointError('Usage: node runner.mjs --config installed-config.json');
    const config = await readJson(process.argv[3]);
    if (process.platform !== 'win32' || process.env.PORTALINK_CHECKPOINT_SERIALIZED !== '1'
      || path.resolve(process.argv[1]) !== path.join(config.storeRoot, 'bin', 'runner.mjs')) {
      throw new CheckpointError('Run the installed checkpoint through its Windows task controls.');
    }
    await verifyInstalled(config);
    config.serializedRun = true;
    const result = await runCheckpoint(config);
    console.log(JSON.stringify({ state: result.state, lastLocalCommit: result.lastLocalCommit, lastRemoteCommit: result.lastRemoteCommit, error: result.error }));
    if (result.state === 'blocked') process.exitCode = 1;
  } catch (e) { console.error(safeMessage(e)); process.exitCode = 1; }
}
