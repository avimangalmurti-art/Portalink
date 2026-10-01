import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('public and platform entries select independent mobile styles, outside the shared provider',()=>{
  assert.match(read('src/index.tsx'),/import ['"]\.\/presentation\/mobile\/mobile\.css['"]/);
  assert.match(read('src/visitor/index.tsx'),/import ['"]\.\/mobile\/public-mobile\.css['"]/);
  assert.doesNotMatch(read('src/visitor/index.tsx'),/presentation\/mobile\/mobile\.css/);
  assert.doesNotMatch(read('src/presentation/AppPresentation.tsx'),/import ['"]\.\/mobile\/mobile\.css/);
  assert.doesNotMatch(read('src/visitor/mobile/public-mobile.css'),/@import|mobile-navigation-dock|studio-header/);
});

test('public navigation and menus own their presentation while retaining shared action dispatch',()=>{
  const app=read('src/visitor/VisitorApp.tsx');
  assert.match(app,/actionSheet=\{PublicActionSheet\}/);
  assert.doesNotMatch(app,/SharedContextActions/);
  assert.match(read('src/components/profile/SharedProfileSidebar.tsx'),/isMobile \? <PublicProfileDrawer/);
  assert.doesNotMatch(read('src/visitor/mobile/PublicProfileDrawer.tsx'),/MobileContextButton|MobileActionSheet/);
  assert.doesNotMatch(read('src/visitor/mobile/PublicActionSheet.tsx'),/MobileActionSheet|mobile-context-sheet/);
  assert.match(read('src/presentation/mobile/MobileContextActions.tsx'),/sheet: Sheet = MobileActionSheet/);
});

test('public drawer is an overlay, preserves touch targets and locks only its open mobile page',()=>{
  const root=postcss.parse(read('src/visitor/mobile/public-mobile.css'));
  root.walkRules(rule=>assert.ok(rule.selector.trim(), 'CSS rule must have a selector'));
  const declarations=selector=>{const result={};root.walkRules(rule=>{if(rule.selectors.includes(selector))rule.walkDecls(d=>{result[d.prop]=d.value;});});return result;};
  const scope="#root .codex-shell[data-presentation='mobile'] ";
  assert.equal(declarations(scope+'.mobile-shared-drawer-layer').position,'fixed');
  assert.equal(declarations(scope+'.mobile-shared-drawer-panel').width,'78%');
  assert.equal(declarations(scope+'.mobile-shared-drawer-panel')['max-width'],'360px');
  assert.equal(declarations(scope+'.mobile-shared-drawer-opener').bottom,'var(--mobile-dock-bottom)');
  assert.equal(declarations("html:has([data-public-portfolio][data-presentation='mobile'] .mobile-shared-drawer-layer[data-visible='true'])").overflow,'hidden');
  assert.equal(declarations("html:has([data-public-portfolio][data-presentation='mobile'] .mobile-project-index-overlay:not(.screen-exit *, [inert] *, [aria-hidden='true'] *))").overflow,'hidden');
  assert.equal(declarations("[data-presentation='mobile'] .mobile-context-notice").position,'fixed');
  assert.match(read('src/visitor/mobile/PublicProfileDrawer.tsx'),/useModalFocus\(visible, panelRef, close, true\)/);
});
