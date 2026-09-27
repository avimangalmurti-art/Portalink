import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const CreatorAvatar = () => null;
const frameExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileVideoFrame.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, { exports: frameExports, require(name) {
  if (name === 'react') return React;
  if (name.endsWith('/CreatorAvatar')) return { CreatorAvatar };
  throw new Error(`Unexpected video frame dependency: ${name}`);
} });
const { MobileVideoFrame } = frameExports;
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}

function harness({ creator } = {}) {
  const slots = [], effects = [], frames = new Map(), selections = [], rendered = [];
  let cursor = 0, frameId = 0, resized;
  const videos = ['a:1', 'b:2', 'b:3', 'c:4', 'd:5'].map(value => {
    const [projectId, id] = value.split(':');
    return { projectId, projectTitle: `Source project ${projectId.toUpperCase()}`, attachment: { id, displayName: `upload-${id}.mp4` } };
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
  }).outputText, { exports, require(name) {
      if (name === 'react') return react;
      if (name.endsWith('/MobileVideoFrame')) return { MobileVideoFrame };
      throw new Error(`Unexpected video sequence dependency: ${name}`);
    },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} disconnect() {} },
  });
  return { surface, selections, rendered, videos,
    render(activeId = 'b:3') {
      cursor = 0; rendered.length = 0;
      const tree = exports.MobileVideoSequence({ videos, activeId, creator, onSelect: entry => selections.push(entry), renderVideo(entry, active) {
        rendered.push({ entry, active });
        return React.createElement('video', { 'data-video-attachment': entry.attachment.id, 'data-video-active': active });
      } });
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

test('each queued video keeps its creator header and own source title outside player virtualization', () => {
  const creator = { name: 'Video creator', avatar: 'video-creator-avatar.jpg' };
  const h = harness({ creator });
  for (const activeId of ['b:3', 'd:5']) {
    const tree = h.render(activeId);
    const sections = React.Children.toArray(tree.props.children);
    assert.equal(sections.length, h.videos.length);
    sections.forEach((section, index) => {
      const entry = h.videos[index], frame = section.props.children;
      assert.equal(frame.type, MobileVideoFrame, 'Even an unmounted player keeps its metadata frame');
      assert.equal(frame.props.creator, creator);
      assert.equal(frame.props.sourceTitle, entry.projectTitle);
      const renderedFrame = frame.type(frame.props);
      const [header, media, title] = React.Children.toArray(renderedFrame.props.children);
      assert.equal(header.props.className, 'mobile-video-creator');
      const avatar = nodes(header).find(node => node.type === CreatorAvatar);
      assert.equal(avatar.props.name, creator.name);
      assert.equal(avatar.props.avatar, creator.avatar);
      assert.equal(avatar.props.shape, 'squircle');
      assert.equal(nodes(header).find(node => node.type === 'span').props.children, creator.name);
      assert.equal(media.props.className, 'mobile-video-frame-media');
      assert.equal(media.props.children, frame.props.children, 'Metadata surrounds rather than replaces the player or placeholder');
      assert.equal(title.props.className, 'mobile-video-source-title');
      assert.equal(title.props.children, entry.projectTitle);
      assert.notEqual(title.props.children, entry.attachment.displayName);
      const isMounted = h.rendered.some(item => item.entry === entry);
      if (isMounted) {
        assert.equal(media.props.children.type, 'video');
        assert.equal(media.props.children.props['data-video-attachment'], entry.attachment.id);
      } else {
        assert.equal(media.props.children.props.className, 'mobile-video-sequence-placeholder');
        assert.equal(media.props.children.props['aria-label'], entry.attachment.displayName);
      }
    });
    assert.equal(h.rendered.filter(item => item.active).length, 1, 'Metadata never mounts an extra active player');
  }
  h.cleanup();
});

test('missing creator data omits identity without inventing an uploader or removing the source title', () => {
  const h = harness();
  const tree = h.render();
  for (const section of React.Children.toArray(tree.props.children)) {
    const frame = section.props.children;
    const renderedFrame = frame.type(frame.props);
    assert.equal(nodes(renderedFrame).some(node => node.type === CreatorAvatar), false);
    assert.equal(nodes(renderedFrame).some(node => node.props.className === 'mobile-video-creator'), false);
    const [media, title] = React.Children.toArray(renderedFrame.props.children);
    assert.equal(media.props.className, 'mobile-video-frame-media');
    assert.equal(title.props.children, frame.props.sourceTitle);
  }
  h.cleanup();
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
