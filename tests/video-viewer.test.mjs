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
  const source = readFileSync(new URL('../src/services/supabase/contentServices.ts', import.meta.url), 'utf8');
  assert.match(source, /kind: playback \? 'video' : resolveStoredMediaKind\(/);
});

const VideoAttachmentPlaceholder = () => null, ProcessingNotice = () => null;
const { AttachmentRenderer } = compile('../src/components/media/AttachmentRenderer.tsx', name => {
  if (name === 'react') return React;
  if (name.endsWith('/VideoAttachment')) return { VideoAttachment: VideoAttachmentPlaceholder };
  if (name.endsWith('/ProcessingNotice')) return { ProcessingNotice };
  return new Proxy({}, { get: () => () => null });
});
test('queued and failed conversion never blocks an available original; missing sources retain processing notice', () => {
  for (const status of ['conversion-required', 'processing', 'processing-failed', 'ready']) {
    const tree = AttachmentRenderer({ attachment: { ...original, kind: 'video', status } });
    assert.equal(tree.props.children.type, VideoAttachmentPlaceholder);
  }
  const pending = AttachmentRenderer({ attachment: { ...original, kind: 'video', status: 'processing', sourceUrl: null } });
  assert.equal(pending.props.children.type, ProcessingNotice);
});

const ErrorState = () => null, LoadingState = () => null;
function harness(attachment = { ...original, kind: 'video' }, conversion) {
  const slots = []; let cursor = 0, refreshes = 0;
  const react = { ...React, useState: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  } };
  const { VideoAttachment } = compile('../src/components/media/VideoAttachment.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/videoPlayback')) return playback;
    if (name.endsWith('/StateViews')) return { ErrorState, LoadingState };
    if (name.endsWith('/ProfileDataContext')) return { useProfileData: () => ({ invalidateProfiles: () => refreshes++ }) };
    return { Button: () => null };
  });
  return { render() { cursor = 0; const element = VideoAttachment({ attachment, conversion }); return element.type(element.props); }, get refreshes() { return refreshes; } };
}
function all(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(all)];
}
const find = (tree, type) => all(tree).find(node => node.type === type);
const error = code => ({ currentTarget: { error: { code } } });

test('native play controls remain visible before metadata, so a tap can start playback', () => {
  const h = harness();
  const video = find(h.render(), 'video');
  assert.equal(video.props.controls, true);
  assert.equal(video.props.playsInline, true);
  assert.equal(video.props.src, 'original.mov');
  assert.doesNotMatch(video.props.className, /opacity-0|hidden/);
  assert.equal(video.props.autoPlay, undefined);
  video.props.onPlay();
  assert.equal(find(h.render(), LoadingState), undefined);
});

test('a failed converted copy falls back to the original and stops after both fail', () => {
  const h = harness({ ...original, metadata: { playbackVideo: { sourceUrl: 'converted.mp4' } } });
  let video = find(h.render(), 'video');
  assert.equal(video.props.src, 'converted.mp4');
  video.props.onError(error(2));
  video = find(h.render(), 'video');
  assert.equal(video.props.src, 'original.mov');
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
