import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/data/navButtonTokens.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { systemGrays, resolveNavButtonTokens: resolve } = exports;

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((byte) => Number.parseInt(byte, 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

test('every saved gray keeps readable control labels through hover and press', () => {
  for (const theme of ['light', 'dark']) {
    for (const gray of systemGrays) {
      for (const highContrast of [false, true]) {
        for (const opaque of [false, true]) {
          const tokens = resolve(theme, '#ff375f', highContrast, opaque, gray.id);
          assert.equal(tokens['--control-rest-surface'], gray[theme], 'the saved gray must remain available');
          for (const [surface, ink] of [
            ['--control-rest-surface', '--control-text'],
            ['--control-hover-surface', '--control-hover-text'],
            ['--control-pressed-surface', '--control-pressed-text'],
          ]) {
            assert.ok(contrast(tokens[surface], tokens[ink]) >= 4.5,
              `${theme}/${gray.id}/${highContrast}: ${surface} needs readable ink`);
          }
          assert.equal(tokens['--control-selected-text'], 'var(--accent-text)');
          assert.equal(tokens['--nav-button-focus-ring'], 'var(--focus-ring)');
        }
      }
    }
  }
});

test('neutral hover follows a neighboring gray across the light/dark boundary', () => {
  const tokens = resolve('dark', '#007aff', false, false, 'gray2');
  assert.equal(tokens['--control-hover-surface'], '#8E8E93');
  assert.notEqual(tokens['--control-text'], tokens['--control-hover-text']);
  assert.equal(tokens['--nav-button-text-selected'], 'var(--accent-text)');
});
