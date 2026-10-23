import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as multipart from '../public/portalink-media-core.js';

function compile(path, require = () => ({})) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require });
  return exports;
}
const assets = compile('../src/features/publishing/assetTypes.ts');
const playback = compile('../src/features/media/videoPlayback.ts', () => multipart);
const attachments = compile('../src/features/media/projectAttachments.ts', name => name.endsWith('/assetTypes') ? assets : {});
const original = { id: 'video', fileName: 'Picture Post.mov', displayName: 'Picture Post', mimeType: 'video/quicktime', extension: 'mov',
  kind: 'unknown', sourceUrl: 'original.mov', status: 'conversion-required', order: 0, metadata: {} };

test('MOV and M4V uploads reach a video player without claiming conversion is complete', () => {
  for (const name of ['Picture Post.mov', 'phone.M4V', 'clip.avi']) {
    const detected = assets.detectAsset({ name, type: 'video/quicktime' });
    assert.equal(detected.family, 'video');
    assert.equal(assets.mediaKindFor(detected.family, detected.capability), 'video');
    assert.equal(assets.canPreviewLocally(detected.family, detected.capability), true);
    assert.equal(assets.initialProcessingState(detected.capability), 'conversion-required');
  }
  assert.equal(assets.mediaKindFor('model', 'converted'), 'unknown');
  assert.equal(assets.canPreviewLocally('document', 'converted'), false);
});

test('legacy videos are normalized on read without mutating stored file data', () => {
  const result = attachments.resolveProjectAttachments({ attachments: [original] }, {});
  assert.equal(result[0].kind, 'video');
  assert.equal(result[0].status, 'conversion-required');
  assert.equal(result[0].sourceUrl, 'original.mov');
  assert.equal(original.kind, 'unknown');
  assert.equal(assets.resolveStoredMediaKind('unknown', 'layout.psd', 'image/vnd.adobe.photoshop'), 'unknown');
  assert.equal(assets.resolveStoredMediaKind('unknown', 'file', 'video/quicktime'), 'video');
  const source = readFileSync(new URL('../src/services/supabase/contentReaders.ts', import.meta.url), 'utf8');
  assert.match(source, /kind: playback \? 'video' : resolveStoredMediaKind\(/);
});

const VideoAttachmentPlaceholder = () => null, ProcessingNotice = () => null;
const { AttachmentRenderer } = compile('../src/components/media/AttachmentRenderer.tsx', name => {
  if (name === 'react') return { ...React, lazy: load => Object.assign(() => null, { load }) };
  if (name.endsWith('/VideoAttachment')) return { VideoAttachment: VideoAttachmentPlaceholder };
  if (name.endsWith('/ProcessingNotice')) return { ProcessingNotice };
  return new Proxy({}, { get: () => () => null });
});
test('queued and failed conversion never blocks an available original; missing sources retain processing notice', async () => {
  for (const status of ['conversion-required', 'processing', 'processing-failed', 'ready']) {
    const tree = AttachmentRenderer({ attachment: { ...original, kind: 'video', status } });
    assert.equal(tree.props.children.type, React.Suspense);
    assert.equal((await tree.props.children.props.children.type.load()).default, VideoAttachmentPlaceholder);
  }
  const pending = AttachmentRenderer({ attachment: { ...original, kind: 'video', status: 'processing', sourceUrl: null } });
  assert.equal(pending.props.children.type, ProcessingNotice);
});

const ErrorState = () => null, LoadingState = () => null;
function harness(attachment = { ...original, kind: 'video' }, conversion, mobile = true, inlinePreview = false) {
  const slots = []; let cursor = 0, refreshes = 0, changed = false;
  let active = true, playError = null;
  const pending = [];
  const calls = [], playbackAttempts = [];
  const attributes = new Map();
  const nativeVideo = {
    muted: true, defaultMuted: true, controls: false, paused: true, dataset: {},
    play() {
      calls.push('play'); playbackAttempts.push({ muted: this.muted, defaultMuted: this.defaultMuted });
      if (playError) return Promise.reject(playError);
      this.paused = false; return Promise.resolve();
    },
    pause() { calls.push('pause'); this.paused = true; },
    closest() { return null; },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name === 'data-video-controls-requested') this.dataset.videoControlsRequested = String(value);
    },
    removeAttribute(name) { attributes.delete(name); },
  };
  let committedProps = {};
  const effect = (callback, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) pending.push(() => {
      old?.cleanup?.(); slots[index] = { deps, cleanup: callback() };
    });
  };
  const react = { ...React, useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect: effect, useLayoutEffect: effect, useState: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => {
      const next = typeof value === 'function' ? value(slots[index]) : value;
      changed ||= !Object.is(slots[index], next); slots[index] = next;
    }];
  } };
  const { VideoAttachment } = compile('../src/components/media/VideoAttachment.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/videoPlayback')) return playback;
    if (name.endsWith('/StateViews')) return { ErrorState, LoadingState };
    if (name.endsWith('/ProfileDataContext')) return { useProfileData: () => ({ invalidateProfiles: () => refreshes++ }) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => mobile ? 'mobile' : 'web' };
    return { Button: () => null };
  });
  return { calls, playbackAttempts, nativeVideo, setActive(value) { active = value; },
    rejectPlay(error) { playError = error; },
    event(extra = {}) {
      return { currentTarget: nativeVideo, target: nativeVideo, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    },
    render() {
    let tree, renders = 0;
    do {
      assert.ok(renders++ < 10, 'Effects must settle without a render loop');
      changed = false; cursor = 0;
      const element = VideoAttachment({ attachment, conversion, active, inlinePreview }); tree = element.type(element.props);
      const video = find(tree, 'video');
      if (video) {
        video.ref.current = nativeVideo;
        for (const name of ['muted', 'controls']) {
          if (!Object.is(committedProps[name], video.props[name])) nativeVideo[name] = Boolean(video.props[name]);
        }
        const requested = video.props['data-video-controls-requested'];
        if (requested !== undefined) nativeVideo.setAttribute('data-video-controls-requested', requested);
        else nativeVideo.removeAttribute('data-video-controls-requested');
        committedProps = video.props;
      }
      while (pending.length) pending.shift()();
    } while (changed);
    return tree;
  }, get refreshes() { return refreshes; } };
}
function all(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(all)];
}
const find = (tree, type) => all(tree).find(node => node.type === type);
const error = code => ({ currentTarget: { error: { code } } });

test('MOBILE videos first render unmuted inline without playback overlays', () => {
  const h = harness();
  const video = find(h.render(), 'video');
  assert.equal(video.props.controls, false);
  assert.equal(video.props['data-video-controls-requested'], false);
  assert.equal(video.props.playsInline, true);
  assert.equal(video.props.src, 'original.mov');
  assert.doesNotMatch(video.props.className, /opacity-0|hidden/);
  assert.equal(video.props.autoPlay, true);
  assert.equal(video.props.muted, false);
  assert.equal(video.props.loop, true);
  assert.equal(h.nativeVideo.muted, false);
  assert.equal(h.nativeVideo.defaultMuted, false);
  assert.deepEqual(h.playbackAttempts, [{ muted: false, defaultMuted: false }]);
  video.props.onPlay(h.event());
  assert.equal(find(h.render(), LoadingState), undefined);
});

test('catalogue video previews expose native controls and truthful labels without autoplay or looping on either platform', () => {
  for (const mobile of [true, false]) {
    const h = harness({ ...original, kind: 'video' }, undefined, mobile, true);
    const video = find(h.render(), 'video');
    assert.equal(video.props.controls, true);
    assert.equal(video.props.autoPlay, false);
    assert.equal(video.props.loop, undefined);
    assert.equal(video.props['aria-label'], original.displayName);
    assert.equal(video.props.onClick, undefined);
    assert.deepEqual(h.playbackAttempts, []);
    const nativeKey = h.event({ key: 'Enter' }); video.props.onKeyDown(nativeKey);
    assert.equal(nativeKey.prevented, false);
    h.setActive(false); h.render();
    assert.equal(h.calls.at(-1), 'pause');
  }
});

test('the first tap reveals native controls and requests playback within that gesture only', () => {
  const h = harness();
  let video = find(h.render(), 'video');
  const before = h.calls.length;
  video.props.onClick(h.event());
  assert.equal(h.calls.length, before + 1, 'The user-activation handler must call play synchronously');
  assert.equal(h.calls.at(-1), 'play');
  video = find(h.render(), 'video');
  assert.equal(video.props.controls, true);
  assert.equal(video.props['data-video-controls-requested'], true);
  assert.equal(video.props.disableRemotePlayback, undefined);
  assert.doesNotMatch(video.props.controlsList ?? '', /noremoteplayback/);
  h.nativeVideo.paused = true;
  const revealedCalls = h.calls.length;
  video.props.onClick(h.event()); h.render();
  assert.equal(h.calls.length, revealedCalls, 'Native pause and seeking taps must not restart playback');
  assert.equal(h.nativeVideo.paused, true);
});

test('Enter and Space reveal controls accessibly without taking over later native keyboard input', () => {
  for (const key of ['Enter', ' ']) {
    const h = harness(); let video = find(h.render(), 'video');
    assert.equal(video.props.tabIndex, 0);
    const before = h.calls.length;
    const unrelated = h.event({ key: 'ArrowRight' }); video.props.onKeyDown(unrelated);
    assert.equal(h.calls.length, before); assert.equal(unrelated.prevented, false);
    const activation = h.event({ key }); video.props.onKeyDown(activation);
    assert.equal(h.calls.length, before + 1, `${JSON.stringify(key)} must play synchronously`);
    assert.equal(activation.prevented, true);
    video = find(h.render(), 'video');
    assert.equal(video.props.controls, true);
    const nativeKey = h.event({ key }); video.props.onKeyDown(nativeKey); h.render();
    assert.equal(h.calls.length, before + 1);
    assert.equal(nativeKey.prevented, false, 'Revealed native controls retain keyboard behavior');
  }
});

test('a blocked autoplay remains clean and playable and the first tap can retry with sound', async () => {
  const h = harness({ ...original, metadata: { playbackVideo: { sourceUrl: 'converted.mp4' } } });
  const rejection = new Error('Playback requires user activation'); rejection.name = 'NotAllowedError';
  h.rejectPlay(rejection);
  let tree = h.render(); await Promise.resolve(); tree = h.render();
  let video = find(tree, 'video');
  assert.equal(video.props.src, 'converted.mp4');
  assert.equal(video.props.controls, false);
  assert.equal(video.props['data-video-controls-requested'], false);
  assert.equal(video.props.muted, false);
  assert.equal(find(tree, ErrorState), undefined);
  assert.equal(h.refreshes, 0);
  h.rejectPlay(null);
  const before = h.calls.length; video.props.onClick(h.event());
  assert.equal(h.calls.length, before + 1);
  await Promise.resolve(); tree = h.render(); video = find(tree, 'video');
  assert.equal(video.props.src, 'converted.mp4');
  assert.equal(video.props.controls, true);
  assert.equal(find(tree, ErrorState), undefined);
  assert.ok(h.playbackAttempts.every(attempt => !attempt.muted && !attempt.defaultMuted));
});

test('scrolling plays only the selected video and ordinary renders preserve manual pause', () => {
  const h = harness();
  h.render();
  assert.deepEqual(h.calls, ['play']);
  h.render();
  assert.deepEqual(h.calls, ['play'], 'A parent rerender must not restart playback');
  h.setActive(false);
  const inactive = find(h.render(), 'video');
  assert.equal(inactive.props.autoPlay, false);
  assert.equal(h.calls.at(-1), 'pause');
  let paused = false;
  inactive.props.onPlay({ currentTarget: { pause() { paused = true; } } });
  assert.equal(paused, true, 'An inactive clip cannot continue playing over the selected one');
  h.setActive(true);
  const active = find(h.render(), 'video');
  assert.equal(active.props.loop, true);
  assert.equal(active.props.autoPlay, true);
  assert.equal(h.calls.at(-1), 'play');
});

test('moving away clears controls and returning resets sound without persisting manual mute', () => {
  const h = harness();
  let video = find(h.render(), 'video'); video.props.onClick(h.event());
  video = find(h.render(), 'video'); assert.equal(video.props.controls, true);
  h.nativeVideo.muted = true; h.nativeVideo.defaultMuted = true;
  const before = h.calls.length;
  h.render();
  assert.equal(h.nativeVideo.muted, true, 'Ordinary rerenders preserve this clip’s manual mute');
  assert.equal(h.calls.length, before);
  h.setActive(false); video = find(h.render(), 'video');
  assert.equal(video.props.controls, false);
  assert.equal(video.props['data-video-controls-requested'], false);
  assert.equal(h.calls.at(-1), 'pause');
  const inactiveCalls = h.calls.length;
  video.props.onClick(h.event()); video.props.onKeyDown(h.event({ key: 'Enter' })); h.render();
  assert.equal(h.calls.length, inactiveCalls, 'A neighboring inactive clip cannot start itself');
  h.setActive(true); video = find(h.render(), 'video');
  assert.equal(video.props.controls, false);
  assert.equal(video.props['data-video-controls-requested'], false);
  assert.equal(h.nativeVideo.muted, false); assert.equal(h.nativeVideo.defaultMuted, false);
  assert.deepEqual(h.playbackAttempts.at(-1), { muted: false, defaultMuted: false });
});

test('WEB retains its native single-video autoplay behavior', () => {
  const h = harness(undefined, undefined, false);
  const video = find(h.render(), 'video');
  assert.equal(video.props.loop, undefined);
  assert.equal(video.props.autoPlay, true);
  assert.equal(video.props.controls, true);
  assert.equal(video.props.muted, true);
  assert.deepEqual(h.calls, []);
});

test('a failed converted copy falls back to the original and stops after both fail', () => {
  const h = harness({ ...original, metadata: { playbackVideo: { sourceUrl: 'converted.mp4' } } });
  let video = find(h.render(), 'video');
  assert.equal(video.props.src, 'converted.mp4');
  video.props.onError(error(2));
  video = find(h.render(), 'video');
  assert.equal(video.props.src, 'original.mov');
  assert.equal(video.props.autoPlay, true);
  assert.equal(video.props.muted, false);
  video.props.onError(error(4));
  assert.equal(find(h.render(), 'video'), undefined);
  assert.match(find(h.render(), ErrorState).props.title, /could not play/);
  assert.equal(find(h.render(), 'a').props.href, 'original.mov');
  find(h.render(), ErrorState).props.onRetry();
  assert.equal(h.refreshes, 1);
  assert.equal(find(h.render(), 'video').props.src, 'converted.mp4');
});

test('missing sources and network errors offer recovery without inventing a successful preview', () => {
  const empty = harness({ ...original, sourceUrl: null });
  assert.equal(find(empty.render(), 'video'), undefined);
  assert.equal(find(empty.render(), ErrorState).props.title, 'Nothing to play yet');
  const h = harness();
  find(h.render(), 'video').props.onError(error(2));
  assert.equal(find(h.render(), ErrorState).props.title, 'This video could not be loaded');
});

test('unsuccessful original playback preserves confirmed conversion progress', () => {
  const h = harness(original, { state: 'processing', message: 'Video queued for conversion.', canRetry: false });
  find(h.render(), 'video').props.onError(error(3));
  const notice = find(h.render(), ErrorState);
  assert.equal(notice.props.description, 'Video queued for conversion.');
  assert.doesNotMatch(notice.props.title, /unsupported|format/);
});
