import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/source-module.mjs';

const { headerScrollUnderlap, headerScrollUnderlaps, applyHeaderScrollUnderlap, applyHeaderScrollUnderlaps } = sourceModule('src/presentation/headerScrollUnderlap.ts', {}, { getComputedStyle: node => node.computed });
function node(top, bottom, computed = {}) {
  const values = new Map();
  return {
    children: [], dataset: {}, parentElement: null,
    computed: { display: 'block', position: 'static', marginTop: '0px', paddingTop: '12px', scrollPaddingTop: 'auto', ...computed },
    style: { getPropertyValue: key => values.get(key) ?? '', setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) },
    contains(other) { return this === other || this.children.some(child => child.contains(other)); },
    getBoundingClientRect: () => ({ top, bottom, height: bottom - top }),
    append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); return this; },
  };
}
function column() {
  const root = node(0, 912, { display: 'flex', flexDirection: 'column' });
  const title = node(0, 68), tabs = node(68, 120), scroll = node(120, 912);
  root.append(title, tabs, scroll);
  return { root, title, tabs, scroll };
}

test('stationary stacked toolbars extend their own scroller beneath the complete header stack', () => {
  const { root, title, tabs, scroll } = column();
  const connection = headerScrollUnderlap([title, tabs], scroll, root);
  assert.equal(connection.branch, scroll);
  assert.equal(connection.height, 120);
  assert.deepEqual(Array.from(connection.headers), [title, tabs], 'Both stationary owners belong to the same stack');
  const cleanup = applyHeaderScrollUnderlap(connection);
  assert.equal(scroll.dataset.fixedHeaderUnderlap, '');
  assert.equal(scroll.dataset.fixedHeaderContent, '');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-height'), '120px');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-padding'), '12px');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-scroll-padding'), '0px');
  cleanup();
  assert.deepEqual(scroll.dataset, {});
  assert.equal(scroll.style.getPropertyValue('--fixed-header-height'), '');
});

test('nested column bodies can scroll under the outer header without moving other panes', () => {
  const { root, title, tabs, scroll } = column();
  const inner = node(120, 912);
  scroll.append(inner);
  const connection = headerScrollUnderlap([title, tabs], inner, root);
  assert.equal(connection.branch, scroll);
  assert.equal(connection.scroller, inner);
  assert.equal(connection.height, 120);
});

test('sticky headers inside a scroller and existing chat underlap are not offset twice', () => {
  const { root, title, tabs, scroll } = column();
  root.children = [scroll]; scroll.append(title, tabs);
  assert.equal(headerScrollUnderlap([title, tabs], scroll, root), null);
  const chat = node(20, 912); root.children = [title, chat]; chat.parentElement = root;
  assert.equal(headerScrollUnderlap([title], chat, root), null);
});

test('side-by-side panes and content separated by an ordinary section keep their layout', () => {
  const { root, title, tabs, scroll } = column();
  root.computed.flexDirection = 'row';
  assert.equal(headerScrollUnderlap([title, tabs], scroll, root), null);
  root.computed.flexDirection = 'column';
  assert.equal(headerScrollUnderlap([title], scroll, root), null, 'An unrelated intermediate section is not swallowed');
});

test('cleanup restores existing inline variables rather than leaking a prior viewport measurement', () => {
  const { root, title, tabs, scroll } = column();
  scroll.style.setProperty('--fixed-header-height', 'old-height');
  const cleanup = applyHeaderScrollUnderlap(headerScrollUnderlap([title, tabs], scroll, root));
  cleanup();
  assert.equal(scroll.style.getPropertyValue('--fixed-header-height'), 'old-height');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-padding'), '');
});

test('nested fixed title and search stacks combine their insets without losing either header', () => {
  const root = node(0, 912, { display: 'flex', flexDirection: 'column' });
  const title = node(0, 56), body = node(56, 850, { display: 'flex', flexDirection: 'column' });
  const search = node(56, 250), scroll = node(250, 850);
  root.append(title, body); body.append(search, scroll);
  const connections = headerScrollUnderlaps([title, search], scroll, root);
  assert.equal(connections.length, 2);
  const cleanup = applyHeaderScrollUnderlaps(connections);
  assert.equal(body.style.getPropertyValue('--fixed-header-height'), '56px');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-height'), '194px');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-content-height'), '250px');
  assert.equal(search.style.getPropertyValue('--fixed-header-offset'), '56px', 'Nested header foreground retains its original place');
  cleanup();
  assert.deepEqual(body.dataset, {});
  assert.deepEqual(scroll.dataset, {});
  assert.deepEqual(search.dataset, {});
});

test('independent panes compensate the same outer toolbar without moving their shared body twice', () => {
  const root = node(0, 912, { display: 'flex', flexDirection: 'column' });
  const title = node(0, 60), body = node(60, 912, { display: 'flex', flexDirection: 'row' });
  const left = node(60, 912), right = node(60, 912);
  root.append(title, body); body.append(left, right);
  const connections = [left, right].flatMap(scroller => headerScrollUnderlaps([title], scroller, root));
  const cleanup = applyHeaderScrollUnderlaps(connections);
  assert.equal(body.style.getPropertyValue('--fixed-header-height'), '60px');
  assert.equal(left.style.getPropertyValue('--fixed-header-content-height'), '60px');
  assert.equal(right.style.getPropertyValue('--fixed-header-content-height'), '60px');
  cleanup();
  assert.deepEqual(left.dataset, {}); assert.deepEqual(right.dataset, {});
});

test('WEB description scrollers cannot pull the surrounding catalogue under its sticky profile header', () => {
  for (const position of ['absolute', 'fixed']) {
    const root = node(0, 900, { display: 'flex', flexDirection: 'column' });
    const header = node(0, 240, { position: 'sticky' });
    const content = node(240, 900), frame = node(240, 500, { position: 'relative' });
    const overlay = node(240, 500, { position }), description = node(252, 488);
    root.append(header, content); content.append(frame); frame.append(overlay); overlay.append(description);
    const web = headerScrollUnderlaps([header], description, root, true);
    assert.equal(web.length, 0, 'An artwork overlay owns no part of the outer page layout');
    const cleanup = applyHeaderScrollUnderlaps(web);
    assert.equal(content.dataset.fixedHeaderUnderlap, undefined);
    assert.equal(description.dataset.fixedHeaderContent, undefined);
    cleanup();
    const mobile = headerScrollUnderlaps([header], description, root);
    assert.equal(mobile.length, 1, 'The default MOBILE policy is preserved');
    assert.equal(mobile[0].branch, content);
    assert.equal(mobile[0].height, 240);
  }
});

test('WEB fixed dialogs retain their internal header underlap without shifting the page behind them', () => {
  const root = node(0, 900, { display: 'flex', flexDirection: 'column' });
  const profileHeader = node(0, 240, { position: 'sticky' }), page = node(240, 900);
  const dialog = node(200, 850, { position: 'fixed', display: 'flex', flexDirection: 'column' });
  const toolbar = node(200, 260), scroll = node(260, 850);
  root.append(profileHeader, page); page.append(dialog); dialog.append(toolbar, scroll);
  const web = headerScrollUnderlaps([profileHeader, toolbar], scroll, root, true);
  assert.equal(web.length, 1);
  assert.equal(web[0].branch, scroll);
  assert.equal(web[0].height, 60);
  assert.deepEqual(Array.from(web[0].headers), [toolbar]);
  const cleanup = applyHeaderScrollUnderlaps(web);
  assert.equal(scroll.dataset.fixedHeaderUnderlap, '');
  assert.equal(scroll.style.getPropertyValue('--fixed-header-content-height'), '60px');
  assert.equal(page.dataset.fixedHeaderUnderlap, undefined);
  cleanup();
  assert.equal(headerScrollUnderlaps([profileHeader, toolbar], scroll, root).length, 2,
    'The default MOBILE connections remain unchanged');
});
