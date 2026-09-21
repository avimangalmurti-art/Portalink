import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

function harness() {
  const slots = [], effects = [], frames = new Map(), selections = [], rendered = [];
  let cursor = 0, frameId = 0, resized;
  const videos = ['a:1', 'b:2', 'b:3', 'c:4', 'd:5'].map(value => {
    const [projectId, id] = value.split(':');
    return { projectId, projectTitle: projectId, attachment: { id, displayName: id } };
  });
  const surface = { scrollTop: 0, clientHeight: 600, children: videos.map((video, index) => ({
    offsetTop: index * 552, offsetHeight: 536, dataset: { videoId: `${video.projectId}:${video.attachment.id}` },
    getAttribute() { return this.dataset.videoId; },
  })) };
  const react = { ...React,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useLayoutEffect(effect, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) effects.push(() => {
        old?.cleanup?.(); slots[i] = { deps, cleanup: effect() };
      });
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileVideoSequence.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: () => react,
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} disconnect() {} },
  });
  return { surface, selections, rendered, videos,
    render(activeId = 'b:3') {
      cursor = 0; rendered.length = 0;
      const tree = exports.MobileVideoSequence({ videos, activeId, onSelect: entry => selections.push(entry), renderVideo(entry, active) { rendered.push({ entry, active }); return null; } });
      tree.ref.current = surface;
      while (effects.length) effects.shift()();
      return tree;
    }, flush() { for (const [id, fn] of frames) { frames.delete(id); fn(); } }, resize() { resized(); },
    cleanup() { for (const slot of slots) slot?.cleanup?.(); }, get pendingFrames() { return frames.size; },
  };
}

test('opens the selected project/video, mounts only neighbors and plays one clip', () => {
  const h = harness(); h.render();
  assert.equal(h.surface.scrollTop, 1072);
  assert.deepEqual(h.rendered.map(item => item.entry.attachment.id), ['2', '3', '4']);
  assert.deepEqual(h.rendered.map(item => item.active), [false, true, false]);
  h.surface.clientHeight = 500; h.resize();
  assert.equal(h.surface.scrollTop, 1122);
});

test('native scroll selects another project without snapping backwards during its navigation', () => {
  const h = harness(), tree = h.render();
  h.surface.scrollTop = 1600;
  tree.props.onScroll(); tree.props.onScroll();
  assert.equal(h.pendingFrames, 1);
  h.flush();
  assert.equal(h.selections[0].projectId, 'c');
  assert.equal(h.selections[0].attachment.id, '4');
  h.render('c:4');
  assert.equal(h.surface.scrollTop, 1600, 'Route selection must retain native scrolling position');
  h.render('a:1');
  assert.equal(h.surface.scrollTop, -32, 'An external file selection should align its video (the browser clamps at zero)');
  tree.props.onScroll(); h.cleanup();
  assert.equal(h.pendingFrames, 0);
});
