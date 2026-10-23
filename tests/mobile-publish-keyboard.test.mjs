import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
const css = readFileSync(new URL('../src/features/publishing/mobile-cover-files.css', import.meta.url), 'utf8');
// Static layout contract only. authoring-focus.test exercises the actual
// keyboard-reduced rectangle/scroll behavior without relying on CSS text.
test('mobile authoring supplies a scoped scroll host and a usable description field', () => {
  const rules = [];
  postcss.parse(css).walkRules(rule => {
    const declarations = new Map();rule.walkDecls(declaration => declarations.set(declaration.prop,declaration.value));
    rules.push({selector:rule.selector,declarations});
  });
  const mobile = rules.filter(rule=>rule.selector.includes("[data-presentation='mobile']"));
  const host=mobile.find(rule=>rule.selector.includes('[data-mobile-publish]')&&rule.selector.includes('.mobile-publish-body')&&rule.declarations.get('overflow-y')==='auto');
  assert.ok(host,'The bounded MOBILE authoring body must remain independently scrollable');
  assert.equal(host.declarations.get('min-height'),'0');
  assert.ok(Number.parseFloat(host.declarations.get('flex'))>0,'The scroll host takes the remaining visible height');
  const description=mobile.find(rule=>rule.selector.includes('[data-details-step]')&&rule.selector.includes('textarea#publish-summary')&&rule.declarations.get('overflow-y')==='auto');
  assert.ok(description,'The description keeps its own native text scrolling');
  assert.equal(description.declarations.get('height'),'auto');
  assert.ok(Number.parseFloat(description.declarations.get('min-height'))>=44,'The field keeps a usable touch-sized editing area');
});
