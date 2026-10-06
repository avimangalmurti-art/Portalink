import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/ui/SavedChangeNotice.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText, { exports, require: name => name === 'react' ? { useRef: () => ({ current: null }), useEffect() {} } : { jsx: React.createElement, jsxs: (type, props) => React.createElement(type, props) } });

test('portal and project reordering produces no persistent saved notice, including undo/redo', () => {
  for (const label of ['Reorder portals', 'Reorder projects']) {
    for (const isSaving of [true, false]) {
      assert.equal(exports.SavedChangeNotice({ history: { undoLabel: label, redoLabel: null, isSaving } }), null);
      assert.equal(exports.SavedChangeNotice({ history: { undoLabel: 'Hide portal', redoLabel: label, isSaving } }), null);
    }
  }
});
