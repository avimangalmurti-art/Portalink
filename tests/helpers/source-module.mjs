import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export function sourceModule(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, URL, URLSearchParams, crypto, ...globals, require(name) {
    assert.ok(name in imports, `Unexpected source dependency ${name}`); return imports[name];
  }});
  return exports;
}
