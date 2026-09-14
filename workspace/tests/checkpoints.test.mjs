import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { BRANCH, REMOTE, CheckpointError, runCheckpoint } from '../scripts/checkpoints/runner.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = name => fs.lstat(name).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

function gitCommand(cwd, args, { input, allow = [0] } = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(GIT_|GCM_|SSH_)/i.test(key)) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GCM_INTERACTIVE: 'never',
  });
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false',
    '-c', 'core.hooksPath=' + path.join(cwd, 'absent-test-hooks'), '-c', 'commit.gpgSign=false',
    '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-C', cwd, ...args], {
    env, input, windowsHide: true, shell: false, timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.ok(allow.includes(result.status), `Fixture Git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.toString('utf8').trim();
}

async function fixture(t, files = { 'app.txt': 'committed source\n' }, policyOverrides = {}) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, 'portalink-checkpoint-test-'));
  t.after(async () => {
    // Delete only this test's freshly allocated directory, never the working checkout.
    const actual = await fs.realpath(root);
    assert.equal(path.dirname(actual), tempRoot);
    assert.match(path.basename(actual), /^portalink-checkpoint-test-/);
    await fs.rm(actual, { recursive: true, force: true });
  });
  const sourceRoot = path.join(root, 'source');
  const storeRoot = path.join(root, 'private');
  await fs.mkdir(sourceRoot);
  const write = async (name, bytes) => {
    const target = path.join(sourceRoot, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  };
  for (const [name, bytes] of Object.entries(files)) await write(name, bytes);
  const git = args => gitCommand(sourceRoot, args);
  git(['init', '-b', 'codex/checkpoint-fixture']);
  git(['config', 'user.name', 'Checkpoint test']);
  git(['config', 'user.email', 'checkpoint-test@localhost']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '--force', '.']);
  git(['commit', '-m', 'Synthetic checkpoint fixture']);
  const policyPath = path.join(root, 'policy.json');
  await fs.writeFile(policyPath, JSON.stringify({
    schemaVersion: 1, scannerVersion: 'injected-test-scanner', scannerSha256: '',
    maxFileBytes: 100_000, maxSnapshotBytes: 1_000_000, maxFiles: 100,
    approvedFindings: [], ...policyOverrides,
  }));
  const config = { sourceRoot, storeRoot, policyPath, gitPath: 'git',
    remoteUrl: REMOTE, branch: BRANCH, remoteEnabled: true };
  const calls = { scans: [], pushes: [] };
  const scan = async (_config, _policy, directory) => { calls.scans.push(directory); };
  const publish = async (_config, commit) => { calls.pushes.push(commit); };
  const run = options => runCheckpoint(config, { scan, publish, ...options });
  const privateGit = args => gitCommand(root, ['--git-dir=' + path.join(storeRoot, 'checkpoint.git'), ...args]);
  const manifest = commit => JSON.parse(privateGit(['show', `${commit}:manifest.json`]));
  const read = (commit, name) => privateGit(['show', `${commit}:workspace/${name}`]);
  const sourceState = async () => ({
    head: git(['rev-parse', 'HEAD']), branch: git(['symbolic-ref', 'HEAD']),
    refs: git(['show-ref']), index: hash(await fs.readFile(path.join(sourceRoot, '.git', 'index'))),
    status: git(['status', '--porcelain=v1', '--untracked-files=all']),
  });
  const objectState = () => privateGit(['count-objects', '-v']);
  return { root, sourceRoot, storeRoot, config, calls, write, git, privateGit,
    manifest, read, run, scan, publish, sourceState, objectState };
}

test('captures saved files and deletion while preserving branch, refs, index, and partial staging', async t => {
  const f = await fixture(t, { 'app.txt': 'committed\n', 'delete-me.txt': 'delete later\n' });
  await f.write('app.txt', 'staged version\n');
  f.git(['add', 'app.txt']);
  await f.write('app.txt', 'saved but unstaged version\n');
  await f.write('new-file.txt', 'new saved work\n');
  await fs.unlink(path.join(f.sourceRoot, 'delete-me.txt'));
  const before = await f.sourceState();
  const result = await f.run();
  assert.equal(result.state, 'ok', result.error);
  assert.equal(result.lastRemoteCommit, result.lastLocalCommit);
  assert.deepEqual(f.calls.pushes, [result.lastLocalCommit]);
  assert.deepEqual(f.manifest(result.lastLocalCommit).files.map(file => file.path), ['app.txt', 'new-file.txt']);
  assert.equal(f.read(result.lastLocalCommit, 'app.txt'), 'saved but unstaged version');
  assert.equal(f.read(result.lastLocalCommit, 'new-file.txt'), 'new saved work');
  assert.equal(f.git(['show', ':app.txt']), 'staged version');
  assert.deepEqual(await f.sourceState(), before);
});

test('first checkpoint includes staged-only changes', async t => {
  const f = await fixture(t);
  await f.write('app.txt', 'staged-only saved work\n');
  f.git(['add', 'app.txt']);
  const before = await f.sourceState();
  const result = await f.run();
  assert.equal(result.state, 'ok', result.error);
  assert.match(result.lastLocalCommit, /^[a-f0-9]{40}$/);
  assert.equal(f.read(result.lastLocalCommit, 'app.txt'), 'staged-only saved work');
  assert.deepEqual(await f.sourceState(), before);
});

test('a staged deletion alone creates the first checkpoint when all saved files match the index', async t => {
  const f = await fixture(t, { 'app.txt': 'unchanged saved source\n', 'deleted.txt': 'remove this source\n' });
  await fs.unlink(path.join(f.sourceRoot, 'deleted.txt'));
  f.git(['add', '--', 'deleted.txt']);
  assert.equal(f.git(['diff', '--name-only']), '');
  assert.equal(f.git(['diff', '--cached', '--name-only']), 'deleted.txt');
  const before = await f.sourceState();
  const result = await f.run();
  assert.equal(result.state, 'ok', result.error);
  assert.match(result.lastLocalCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(f.manifest(result.lastLocalCommit).files.map(file => file.path), ['app.txt']);
  assert.equal(f.read(result.lastLocalCommit, 'app.txt'), 'unchanged saved source');
  assert.deepEqual(await f.sourceState(), before);
});

test('excludes ignored tracked files, nested ignores, environment files, credentials, and private keys', async t => {
  const excluded = ['.env', '.env.local', '.env.production', 'credentials.json', 'client-secret.txt',
    'service-account.json', 'private.pem', 'id_ed25519', '.aws/config', '.codex/settings.json',
    'secrets/settings.json', 'credentials/settings.json', '.kube/config',
    'nested/ignored.txt', 'info-ignored.txt', 'global-ignored.txt'];
  const f = await fixture(t, {
    'app.txt': 'baseline\n', '.gitignore': '.env*\n!.env.example\n',
    '.env.example': 'PUBLIC_API_URL=\n', 'nested/.gitignore': 'ignored.txt\n',
    ...Object.fromEntries(excluded.map(name => [name, 'excluded fixture value\n'])),
  });
  await fs.writeFile(path.join(f.sourceRoot, '.git', 'info', 'exclude'), 'info-ignored.txt\n');
  f.config.excludesFile = path.join(f.root, 'global-ignore');
  await fs.writeFile(f.config.excludesFile, 'global-ignored.txt\n');
  for (const name of excluded) await f.write(name, 'changed excluded fixture\n');
  await f.write('nested/untracked-ignored.local', 'also excluded\n');
  await f.write('app.txt', 'eligible changed work\n');
  const before = await f.sourceState();
  const result = await f.run();
  assert.equal(result.state, 'ok', result.error);
  assert.deepEqual(f.manifest(result.lastLocalCommit).files.map(file => file.path),
    ['.env.example', '.gitignore', 'app.txt', 'nested/.gitignore']);
  assert.deepEqual(await f.sourceState(), before);
});

test('clean or exclusively ignored changes do not create an initial checkpoint', async t => {
  const f = await fixture(t, { 'app.txt': 'baseline\n', '.gitignore': 'ignored.txt\n', 'ignored.txt': 'baseline\n' });
  const clean = await f.run();
  assert.equal(clean.state, 'ok', clean.error);
  assert.equal(clean.lastLocalCommit, null);
  await f.write('ignored.txt', 'changed tracked ignored content\n');
  await f.write('.env.local', 'excluded value\n');
  const result = await f.run();
  assert.equal(result.state, 'ok', result.error);
  assert.equal(result.lastLocalCommit, null);
  assert.deepEqual(f.calls.pushes, []);
});

test('unchanged runs create no new objects or pushes; later saved changes create a child checkpoint', async t => {
  const f = await fixture(t);
  await f.write('app.txt', 'first change\n');
  const first = await f.run();
  assert.equal(first.state, 'ok', first.error);
  const objects = f.objectState();
  const unchanged = await f.run();
  assert.equal(unchanged.state, 'ok', unchanged.error);
  assert.equal(unchanged.lastLocalCommit, first.lastLocalCommit);
  assert.equal(f.objectState(), objects);
  assert.deepEqual(f.calls.pushes, [first.lastLocalCommit]);
  await f.write('app.txt', 'second change\n');
  const next = await f.run();
  assert.equal(next.state, 'ok', next.error);
  assert.notEqual(next.lastLocalCommit, first.lastLocalCommit);
  assert.equal(f.privateGit(['rev-parse', next.lastLocalCommit + '^']), first.lastLocalCommit);
  assert.equal(f.read(next.lastLocalCommit, 'app.txt'), 'second change');
});

test('scanner failure blocks Git object creation and publishing', async t => {
  const f = await fixture(t);
  await f.write('app.txt', 'saved work awaiting scan\n');
  const before = await f.sourceState();
  const result = await f.run({ scan: async () => { throw new CheckpointError('Synthetic scanner failure.'); } });
  assert.equal(result.state, 'blocked');
  assert.match(result.error, /scanner failure/);
  assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
  assert.deepEqual(f.calls.pushes, []);
  assert.deepEqual(await f.sourceState(), before);
  assert.equal((await fs.readdir(f.storeRoot)).some(name => /^(capture|outgoing)-/.test(name)), false);
});

test('scanner failure on a later run leaves prior checkpoint objects and refs untouched', async t => {
  const f = await fixture(t);
  await f.write('app.txt', 'first safe version\n');
  const first = await f.run();
  assert.equal(first.state, 'ok', first.error);
  const objects = f.objectState();
  await f.write('app.txt', 'changed version awaiting scan\n');
  const result = await f.run({ scan: async () => { throw new CheckpointError('Synthetic scan block.'); } });
  assert.equal(result.state, 'blocked');
  assert.equal(f.objectState(), objects);
  assert.equal(f.privateGit(['rev-parse', `refs/heads/${BRANCH}`]), first.lastLocalCommit);
  assert.deepEqual(f.calls.pushes, [first.lastLocalCommit]);
});

test('a file changed during capture blocks scanning and object creation', async t => {
  const f = await fixture(t);
  await f.write('app.txt', 'captured value\n');
  const result = await f.run({ afterCapture: () => f.write('app.txt', 'newer saved value\n') });
  assert.equal(result.state, 'blocked');
  assert.match(result.error, /changed during capture/);
  assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
  assert.deepEqual(f.calls.scans, []);
  assert.deepEqual(f.calls.pushes, []);
  assert.equal(await fs.readFile(path.join(f.sourceRoot, 'app.txt'), 'utf8'), 'newer saved value\n');
});

test('a tracked deletion restored during capture is rejected', async t => {
  const f = await fixture(t, { 'app.txt': 'baseline\n', 'deleted.txt': 'original\n' });
  await fs.unlink(path.join(f.sourceRoot, 'deleted.txt'));
  const result = await f.run({ afterCapture: () => f.write('deleted.txt', 'restored saved work\n') });
  assert.equal(result.state, 'blocked');
  assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
  assert.deepEqual(f.calls.scans, []);
  assert.deepEqual(f.calls.pushes, []);
});

test('offline checkpoint is retried without creating a duplicate commit when source is unchanged', async t => {
  const f = await fixture(t);
  await f.write('app.txt', 'saved offline work\n');
  let attempts = 0;
  const publish = async (_config, commit) => {
    attempts += 1;
    if (attempts === 1) throw new CheckpointError('Synthetic offline upload.');
    f.calls.pushes.push(commit);
  };
  const offline = await f.run({ publish });
  assert.equal(offline.state, 'blocked');
  assert.match(offline.lastLocalCommit, /^[a-f0-9]{40}$/);
  assert.equal(offline.lastRemoteCommit, undefined);
  const objects = f.objectState();
  const retry = await f.run({ publish });
  assert.equal(retry.state, 'ok', retry.error);
  assert.equal(retry.lastLocalCommit, offline.lastLocalCommit);
  assert.equal(retry.lastRemoteCommit, offline.lastLocalCommit);
  assert.equal(f.objectState(), objects);
  assert.equal(attempts, 2);
  assert.deepEqual(f.calls.pushes, [offline.lastLocalCommit]);
  const done = await f.run({ publish });
  assert.equal(done.lastLocalCommit, offline.lastLocalCommit);
  assert.equal(attempts, 2);
});

test('main and another remote are rejected before any capture or publishing', async t => {
  const f = await fixture(t);
  for (const override of [{ branch: 'main' }, { remoteUrl: 'https://example.invalid/other.git' }]) {
    await assert.rejects(runCheckpoint({ ...f.config, ...override }, { scan: f.scan, publish: f.publish }),
      /Invalid checkpoint destination/);
  }
  assert.equal(await exists(f.storeRoot), false);
  assert.deepEqual(f.calls.scans, []);
  assert.deepEqual(f.calls.pushes, []);
});

test('storage inside the working project is rejected before any directory is created', async t => {
  for (const name of ['checkpoint-storage', '..checkpoint']) {
    await t.test(name, async child => {
      const f = await fixture(child);
      const storeRoot = path.join(f.sourceRoot, name);
      const before = await f.sourceState();
      await assert.rejects(runCheckpoint({ ...f.config, storeRoot }, { scan: f.scan, publish: f.publish }),
        /outside|storage|working project|working folder/i);
      assert.equal(await exists(storeRoot), false);
      assert.deepEqual(await f.sourceState(), before);
      assert.deepEqual(f.calls.scans, []);
      assert.deepEqual(f.calls.pushes, []);
    });
  }
});

test('an external symlink or junction redirecting storage into the project is rejected before writes', async t => {
  const f = await fixture(t);
  const redirect = path.join(f.root, 'redirect');
  await fs.symlink(f.sourceRoot, redirect, process.platform === 'win32' ? 'junction' : 'dir');
  const before = await f.sourceState();
  for (const storeRoot of [redirect, path.join(redirect, 'new-storage')]) {
    await assert.rejects(runCheckpoint({ ...f.config, storeRoot }, { scan: f.scan, publish: f.publish }),
      /outside|storage|working project|working folder|link|junction/i);
  }
  for (const name of ['new-storage', 'run.lock', 'status.json', 'checkpoint.git']) {
    assert.equal(await exists(path.join(f.sourceRoot, name)), false);
  }
  assert.deepEqual(await f.sourceState(), before);
  assert.deepEqual(f.calls.scans, []);
  assert.deepEqual(f.calls.pushes, []);
});

test('source and private-store hooks, fsmonitor, and clean filters never execute', async t => {
  const f = await fixture(t, { 'app.txt': 'baseline\n', '.gitattributes': '*.txt filter=checkpoint-test\n' });
  const initial = await f.run();
  assert.equal(initial.state, 'ok', initial.error);
  const marker = path.join(f.root, 'hook-or-filter-ran');
  const quote = value => "'" + value.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'";
  const command = `printf invoked >> ${quote(marker)}; cat`;
  const hookDirectory = path.join(f.root, 'dangerous-hooks');
  await fs.mkdir(hookDirectory);
  for (const name of ['pre-commit', 'post-commit', 'post-checkout', 'pre-push', 'pre-auto-gc', 'fsmonitor']) {
    const hook = path.join(hookDirectory, name);
    await fs.writeFile(hook, `#!/bin/sh\nprintf invoked >> ${quote(marker)}\nexit 1\n`);
    await fs.chmod(hook, 0o755);
  }
  for (const git of [f.git, f.privateGit]) {
    git(['config', 'core.hooksPath', hookDirectory]);
    git(['config', 'core.fsmonitor', path.join(hookDirectory, 'fsmonitor')]);
    git(['config', 'filter.checkpoint-test.clean', command]);
    git(['config', 'filter.checkpoint-test.smudge', command]);
    git(['config', 'filter.checkpoint-test.required', 'true']);
  }
  await f.write('app.txt', 'saved data bypasses filters\n');
  // Avoid status here: Git status itself is permitted to invoke a configured clean filter.
  const index = hash(await fs.readFile(path.join(f.sourceRoot, '.git', 'index')));
  const head = f.git(['rev-parse', 'HEAD']);
  const result = await f.run();
  assert.equal(result.state, 'ok', result.error);
  assert.equal(f.read(result.lastLocalCommit, 'app.txt'), 'saved data bypasses filters');
  assert.equal(await exists(marker), false);
  assert.equal(hash(await fs.readFile(path.join(f.sourceRoot, '.git', 'index'))), index);
  assert.equal(f.git(['rev-parse', 'HEAD']), head);
});

test('symlink or Windows junction in a tracked path blocks capture', async t => {
  const f = await fixture(t, { 'app.txt': 'baseline\n', 'linked/file.txt': 'tracked original\n' });
  const outside = path.join(f.root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'file.txt'), 'outside content\n');
  const linked = path.join(f.sourceRoot, 'linked');
  await fs.unlink(path.join(linked, 'file.txt'));
  await fs.rmdir(linked);
  await fs.symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const result = await f.run();
  assert.equal(result.state, 'blocked');
  assert.match(result.error, /Symbolic link|junction/);
  assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
  assert.deepEqual(f.calls.scans, []);
  assert.deepEqual(f.calls.pushes, []);
});

test('nested Git repositories block capture', async t => {
  const f = await fixture(t);
  const nested = path.join(f.sourceRoot, 'nested');
  await fs.mkdir(nested);
  gitCommand(nested, ['init']);
  await fs.writeFile(path.join(nested, 'nested.txt'), 'nested work\n');
  const result = await f.run();
  assert.equal(result.state, 'blocked');
  assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
  assert.deepEqual(f.calls.scans, []);
  assert.deepEqual(f.calls.pushes, []);
});

test('archives and unsupported binaries are blocked before scanning', async t => {
  for (const [name, bytes] of [['archive.zip', 'synthetic archive fixture'], ['unknown.bin', Buffer.from([0, 255, 0, 254])]]) {
    await t.test(name, async child => {
      const f = await fixture(child);
      await f.write(name, bytes);
      const result = await f.run();
      assert.equal(result.state, 'blocked');
      assert.match(result.error, /Archive|Unsupported binary/);
      assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
      assert.deepEqual(f.calls.scans, []);
      assert.deepEqual(f.calls.pushes, []);
    });
  }
});

test('configured file, total-size, and file-count limits fail closed', async t => {
  for (const [name, limits] of [
    ['per-file', { maxFileBytes: 2 }], ['total-size', { maxSnapshotBytes: 2 }], ['file-count', { maxFiles: 0 }],
  ]) {
    await t.test(name, async child => {
      const f = await fixture(child, { 'app.txt': 'baseline\n' }, limits);
      await f.write('app.txt', 'changed content\n');
      const result = await f.run();
      assert.equal(result.state, 'blocked');
      assert.match(result.error, /limit/);
      assert.equal(await exists(path.join(f.storeRoot, 'checkpoint.git')), false);
      assert.deepEqual(f.calls.scans, []);
      assert.deepEqual(f.calls.pushes, []);
    });
  }
});
