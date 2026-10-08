import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/features/publishing/mobile-cover-files.css', import.meta.url), 'utf8');
test('mobile details keeps fields measurable and scrollable in a keyboard-reduced viewport', () => {
  const rule = selector => css.split(`[data-presentation='mobile'] [data-details-step] ${selector} {`)[1]?.split('}')[0];
  assert.match(rule('.mobile-publish-body'), /overflow-y: auto/);
  assert.match(rule('.project-form-details'), /flex: 1 0 auto/);
  assert.match(rule('[data-field-workspace][data-multiline]'), /min-height: 200px/);
  assert.match(rule('.details-editor'), /min-height: 176px/);
  assert.match(rule('.details-editor textarea'), /min-height: 96px/);
});
