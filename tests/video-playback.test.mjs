import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as multipart from '../public/portalink-media-core.js';

const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/features/media/videoPlayback.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, require: () => multipart });
const { readVideoPlayback, videoSource, videoSources } = exports;
const profile = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const path = `${profile}/video-previews/${project}/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd/playback.mp4`;
const playbackVideo = { storagePath: path, sizeBytes: 1000, mimeType: 'video/mp4', sourceUrl: 'https://untrusted.example/video' };

test('playback metadata accepts only this profile/project namespace and discards stored URLs', () => {
  const parsed = readVideoPlayback({ playbackVideo }, `${profile}/original.mov`, project);
  assert.equal(parsed.storagePath, path);
  assert.equal(parsed.sourceUrl, undefined);
  for (const storagePath of [path.replace(profile, project), path.replace(project, profile), path.replace('/playback.mp4', '/../original.mov'), 'https://example.test/video']) {
    assert.equal(readVideoPlayback({ playbackVideo: { ...playbackVideo, storagePath } }, `${profile}/original.mov`, project), null);
  }
});

test('incomplete multipart playback metadata is rejected', () => {
  const video = { ...playbackVideo, storagePath: path + '.portalink-multipart.json' };
  assert.equal(readVideoPlayback({ playbackVideo: video }, `${profile}/original.mov`, project), null);
  video.multipart = { version: 1, partBytes: 41943040, partCount: 1, sizeBytes: 1000 };
  assert.equal(readVideoPlayback({ playbackVideo: video }, `${profile}/original.mov`, project).multipart.partCount, 1);
  video.multipart.sizeBytes = 999;
  assert.equal(readVideoPlayback({ playbackVideo: video }, `${profile}/original.mov`, project), null);
});

test('fresh converted source wins while original remains available for download', () => {
  const attachment = { sourceUrl: 'original', metadata: { playbackVideo: { sourceUrl: 'converted' } } };
  assert.equal(videoSource(attachment), 'converted');
  assert.equal(attachment.sourceUrl, 'original');
  attachment.metadata.playbackVideo.sourceUrl = null;
  assert.equal(videoSource(attachment), 'original');
});

test('playback candidates prefer conversion, retain original fallback and never duplicate a URL', () => {
  assert.deepEqual(Array.from(videoSources({ sourceUrl: 'original', metadata: { playbackVideo: { sourceUrl: 'converted' } } })), ['converted', 'original']);
  assert.deepEqual(Array.from(videoSources({ sourceUrl: 'original', metadata: { playbackVideo: { sourceUrl: 'original' } } })), ['original']);
  assert.deepEqual(Array.from(videoSources({ sourceUrl: null })), []);
});
