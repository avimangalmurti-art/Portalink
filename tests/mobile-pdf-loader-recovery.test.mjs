import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

/** Execute the actual loader declarations; only the native import boundary is controlled. */
function fixture({ delayedWaiters = false } = {}) {
  const file = ts.createSourceFile('PdfPage.tsx', readFileSync(new URL('../src/components/media/PdfPage.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cache = file.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(file) === 'pdfJsPromise'));
  const loader = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadPdfJs');
  assert.ok(cache); assert.ok(loader);
  const input = `const pdfWorkerUrl = 'controlled-worker.mjs';\n${cache.getText(file)}\n${loader.getText(file)}`;
  const requests = [], exports = {};
  const code = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    transformers: { before: [context => root => {
      const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? context.factory.createCallExpression(context.factory.createIdentifier('importPdfEngine'), undefined, [])
        : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit);
    }] },
  }).outputText;
  vm.runInNewContext(code, { exports, importPdfEngine() {
    if (!delayedWaiters) { const request = deferred(); requests.push(request); return request.promise; }
    // Independently release await continuations to exercise the stale-catch
    // ownership guard while a newer import is already shared by other readers.
    const request = { waiters: [] }; requests.push(request);
    return { then(transform) { return { then(resolve, reject) { request.waiters.push({ resolve: value => resolve(transform(value)), reject }); } }; } };
  } });
  return { load: exports.loadPdfJs, requests };
}

test('opted-in mobile failure permits a later engine import without retrying inside the failed call', async () => {
  const f = fixture(), first = f.load(true), rejected = assert.rejects(first, /Disconnected/);
  assert.equal(f.requests.length, 1); f.requests[0].reject(new Error('Disconnected')); await rejected; await settle();
  assert.equal(f.requests.length, 1, 'The failed import must not automatically loop');
  const second = f.load(true); assert.equal(f.requests.length, 2);
  const engine = { GlobalWorkerOptions: {} }; f.requests[1].resolve(engine);
  assert.equal(await second, engine); assert.equal(engine.GlobalWorkerOptions.workerSrc, 'controlled-worker.mjs');
});

test('a successful engine remains cached across mobile and default desktop callers', async () => {
  const f = fixture(), initial = f.load(true), engine = { GlobalWorkerOptions: {} };
  f.requests[0].resolve(engine); assert.equal(await initial, engine);
  for (const optedIn of [false, true, true, false]) assert.equal(await f.load(optedIn), engine);
  assert.equal(f.requests.length, 1);
});

test('concurrent readers share each engine attempt and receive the same success or failure', async () => {
  const f = fixture(); const first = f.load(true), second = f.load(true), web = f.load();
  const failed = [first, second, web].map(promise => assert.rejects(promise, /Engine offline/));
  assert.equal(f.requests.length, 1); f.requests[0].reject(new Error('Engine offline')); await Promise.all(failed);
  const retry = f.load(true), another = f.load(true), desktop = f.load();
  assert.equal(f.requests.length, 2);
  const engine = { GlobalWorkerOptions: {} }; f.requests[1].resolve(engine);
  assert.deepEqual(await Promise.all([retry, another, desktop]), [engine, engine, engine]);
});

test('a stale failure continuation cannot evict a newer shared import', async () => {
  const f = fixture({ delayedWaiters: true });
  const first = f.load(true), late = f.load(true);
  const firstFailure = assert.rejects(first, /Old attempt/), lateFailure = assert.rejects(late, /Old attempt/);
  await settle(); assert.equal(f.requests[0].waiters.length, 2);
  f.requests[0].waiters[0].reject(new Error('Old attempt')); await firstFailure;
  const replacement = f.load(true); await settle(); assert.equal(f.requests.length, 2);
  f.requests[0].waiters[1].reject(new Error('Old attempt')); await lateFailure;
  const shared = f.load(true); await settle(); assert.equal(f.requests.length, 2, 'The late catch must leave the newer pending promise intact');
  const engine = { GlobalWorkerOptions: {} };
  for (const waiter of f.requests[1].waiters) waiter.resolve(engine);
  assert.deepEqual(await Promise.all([replacement, shared]), [engine, engine]);
});

test('default desktop calls retain the established rejected-import cache until a mobile opt-in releases it', async () => {
  const f = fixture(), first = f.load(), failure = assert.rejects(first, /Unavailable/);
  f.requests[0].reject(new Error('Unavailable')); await failure;
  await assert.rejects(f.load(), /Unavailable/); await assert.rejects(f.load(false), /Unavailable/);
  assert.equal(f.requests.length, 1, 'Desktop alone keeps the original loading behavior');
  await assert.rejects(f.load(true), /Unavailable/);
  assert.equal(f.requests.length, 1, 'Opt-in releases the failed attempt for a subsequent explicit call');
  const retry = f.load(true); assert.equal(f.requests.length, 2);
  const engine = { GlobalWorkerOptions: {} }; f.requests[1].resolve(engine); assert.equal(await retry, engine);
});
