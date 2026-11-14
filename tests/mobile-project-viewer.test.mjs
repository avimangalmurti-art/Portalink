import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const actionMap = sourceModule('src/presentation/mobile/contextActions.ts', { 'lucide-react': new Proxy({}, { get: (_, key) => key }) });
const pageLayout = sourceModule('src/features/projects/pageLayout.ts', {});
const portalBrowsing = sourceModule('src/components/profile/portalProjectBrowsing.ts');

const AttachmentRenderer = () => null, EngagementBar = () => null, CommentThreadView = () => null, MediaCommentsPopover = () => null, EngagementFeedback = () => null;
const MobileProjectPageCounter = () => null;
const ProjectOpeningLoader = () => null;
const FollowContentInfoPopup = () => null;
const MobileVideoSequence = () => null;
const MobileVideoFrame = () => null;
const ownerActionsExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectPopup.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, { exports: ownerActionsExports, require: name => name === 'react' ? React : {} });
const ProjectPopupOwnerActions = ownerActionsExports.ProjectPopupOwnerActions;
function nodes(node) {
  if (!React.isValidElement(node)) return [];
  const children = typeof node.props.children === 'function' ? node.props.children(node.props.onClose) : node.props.children;
  return [node, ...React.Children.toArray(children).flatMap(nodes)];
}
const withProp = (tree, prop) => nodes(tree).find(node => prop in node.props);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);

function harness({ signedIn = true, mobile = true, readOnlyShare = false, empty = false, engagement = {}, mediaKind = 'video', search = '', hash = '', lifecycle = false, openingStage = null, sourceTransform = source => source } = {}) {
  engagement = { isPending: () => false, isEngaged: () => false, canEngage: true, isResolving: false, ...engagement };
  const slots = []; let cursor = 0, panel = null, dirty = false, lastOverrides = {}, childEffect = null;
  const pending = { layout: [], passive: [] };
  const frames = new Map();
  let nextFrame = 0, reportMutation;
  const openingBrowser = openingStage ? {
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { reportMutation = this.callback; }
      disconnect() { reportMutation = undefined; }
    },
  } : {};
  const sameDeps = (previous, next) => previous && next && previous.length === next.length && next.every((value, index) => Object.is(previous[index], value));
  const schedule = (phase, effect, deps) => {
    if (!lifecycle) return;
    const index = cursor++, slot = slots[index] ??= {};
    if (sameDeps(slot.deps, deps)) return;
    slot.deps = deps;
    pending[phase].push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
  };
  const serviceIds = [], gates = [], audioInterruptions = [];
  let screenActive = true;
  const viewerMemory = new Map(), memoryWrites = [];
  const swipeCalls = [], navigationCalls = [], outsideCalls = [], optionCalls = [], screenActions = [], sharedTargets = [], copies = [], readingScroll = [];
  const onBack = () => navigationCalls.push('back'), onClose = () => navigationCalls.push('close');
  const swipeHandlers = { onPointerUpCapture() {}, onClickCapture() {} };
  const react = { ...React,
    useId: () => 'project-response-content',
    useEffect: (effect, deps) => schedule('passive', effect, deps),
    useLayoutEffect: (effect, deps) => schedule('layout', effect, deps),
    useCallback(fn, deps) {
      if (!lifecycle) return fn;
      const index = cursor++, slot = slots[index];
      if (!slot || !sameDeps(slot.deps, deps)) slots[index] = { deps, value: fn };
      return slots[index].value;
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => {
        const value = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; }
      }];
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(sourceTransform(readFileSync(new URL('../src/components/media/ProjectMediaViewer.tsx', import.meta.url), 'utf8')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, URL, URLSearchParams, ...openingBrowser, window: { innerWidth: 420, innerHeight: 912, addEventListener() {}, removeEventListener() {}, setTimeout: () => 1, clearTimeout() {}, location: {pathname:readOnlyShare?'/share/creator/c/portal/project':'/p/creator/c/portal/project',origin:'https://portalink.test',href:'https://portalink.test/p/creator/c/portal/project'+search+hash,search,hash} }, require(name) {
    if (name.endsWith('/publicOrigin')) return { PUBLIC_ORIGIN: 'https://portalinknetworks.com' };
    if (name.endsWith('/InternalContentShare')) return { useInternalContentShare: () => target => sharedTargets.push(target) };
    if (name.endsWith('/copyPublicLink')) return { copyPublicLink: async value => copies.push(value) };
    if (name.endsWith('/ExportSheet')) return {ExportSheet:'export-sheet'};
    if (name === 'react') return react;
    if (name.endsWith('/contextActions')) return actionMap;
    if (name.endsWith('/useProjectReach')) return { useProjectReach() {} };
    if (name === 'react-router-dom') return { useNavigate: () => path => navigationCalls.push(path) };
    if (name.endsWith('/app/routes')) return { buildPath: (kind, {profileId}) => `${kind}:${profileId}` };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ isAuthenticated: signedIn, requestAuthenticatedDestination: (intent,view) => gates.push({intent,view}), isInitializing: false, viewerProfileId: null }) };
    if (name.endsWith('/ProjectSharePathContext')) return { ProjectSharePathContext: { Provider: 'project-share-path' } };
    if (name.endsWith('/MobilePageContext')) return { MobilePageContext: { Provider: 'mobile-page-context' } };
    if (name.endsWith('/MobileContextActions')) return { MobileContextButton: 'context-button', useMobileActions: () => ({ open(model) { optionCalls.push(model); } }), useMobileScreenActions(model, priority, onOpen) { screenActions.push({model,priority,onOpen}); } };
    if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => screenActive };
    if (name.endsWith('/profileAudioPlayback')) return { suspendProfileAudioForVideo: () => {
      audioInterruptions.push('video opened');
      return () => { audioInterruptions.push('video left'); };
    } };
    if (name.endsWith('/MediaInteractionBar')) return { MediaInteractionBar: 'media-interaction-bar' };
    if (name.endsWith('/AttachmentRenderer')) return { AttachmentRenderer };
    if (name.endsWith('/StateViews')) return { ProjectOpeningLoader };
    if (name.endsWith('/useDocumentReadingScroll')) return { useDocumentReadingScroll: (...args) => readingScroll.push(args) };
    if (name.endsWith('/MobileVideoSequence')) return { MobileVideoSequence };
    if (name.endsWith('/MobileVideoFrame')) return { MobileVideoFrame };
    if (name.endsWith('/MobileProjectPageCounter')) return { MobileProjectPageCounter };
    if (name.endsWith('/EngagementBar')) return { EngagementBar, EngagementFeedback };
    if (name.endsWith('/CommentThreadView')) return { CommentThreadView };
    if (name.endsWith('/FollowContentInfoPopup')) return { FollowContentInfoPopup };
    if (name.endsWith('/MobileProjectPopup')) return { ProjectPopupOwnerActions };
    if (name.endsWith('/MediaCommentsPopover')) return { MediaCommentsPopover };
    if (name.endsWith('/useNavigationOutsideTap')) return { useNavigationOutsideTap: (open, layer, onClose) => {
      outsideCalls.push({ open, layer, onClose });
    } };
    if (name.endsWith('/useProjectBackSwipe')) return { useProjectBackSwipe: (surfaceRef, options) => {
      swipeCalls.push({ surfaceRef, ...options });
      return swipeHandlers;
    } };
    if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: id => { serviceIds.push(id); return engagement; } };
    if (name.endsWith('/useProjectComments')) return { useProjectComments: id => { serviceIds.push(id); return {}; } };
    if (name.endsWith('/pageLayout')) return pageLayout;
    if (name.endsWith('/viewerMemory')) return {
      readViewerMemory: key => viewerMemory.get(key) ?? {},
      updateViewerMemory(key, patch) {
        viewerMemory.set(key, { ...viewerMemory.get(key), ...patch });
        memoryWrites.push([key, patch.activeAttachmentId]);
      },
    };
    if (name.endsWith('/projectContinuity')) return { projectContinuityStyle: () => ({}) };
    return new Proxy({}, { get: () => () => null });
  } });
  const attachments = empty ? [] : ['first', 'second'].map(id => ({ id, kind: mediaKind, displayName: id, typeLabel: 'Video' }));
  const index = React.createElement('aside', { 'data-project-index-panel': '' }, React.createElement('button', { onClick: () => { panel = null; }, 'aria-label': 'Collapse document list' }));
  return { gates, attachments, optionCalls, screenActions, sharedTargets, copies, serviceIds, viewerMemory, memoryWrites, swipeCalls, swipeHandlers, navigationCalls, outsideCalls, readingScroll, onBack, audioInterruptions, openIndex() { panel = 'index'; }, setScreenActive(active) { screenActive = active; },
    inspectOpeningFrame() {
      reportMutation?.();
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    },
    // Model React's commit order without mounting media or invoking backend APIs:
    // parent layout effects, child focus-report passive effect, parent passive effects.
    // The callback comes from the actual AttachmentRenderer element, as it does
    // when ImageAttachment restores a focused page from viewer memory.
    commitFocusedPage(focused, overrides = lastOverrides) {
      assert.equal(lifecycle, true);
      let tree;
      for (let commits = 0; commits < 12; commits++) {
        dirty = false;
        tree = this.render(overrides);
        if (openingStage) withProp(tree, 'data-project-stage').ref.current = openingStage;
        pending.layout.splice(0).forEach(run => run());
        const renderer = nodes(tree).find(node => node.type === AttachmentRenderer);
        const part = nodes(tree).find(node => node.props.renderer?.attachment.kind === 'document')?.props;
        const callback = focused === null ? null : renderer?.props.onFocusModeChange ?? part?.onFocus;
        // Keep the focused page object stable across scope changes: the real
        // child's effect re-runs only if focus or its reporting callback changes.
        if (childEffect?.callback !== callback || childEffect?.focused !== focused) {
          childEffect?.report(false);
          const report = part && !renderer ? value => callback?.(part.renderer.attachment.id, value) : value => callback?.(value);
          childEffect = callback ? { callback, focused, report } : null;
          report(focused);
        }
        pending.passive.splice(0).forEach(run => run());
        if (!dirty) return tree;
      }
      assert.fail('The real parent effects and child focus report must settle');
    },
    render(overrides = {}) {
    cursor = 0;
    lastOverrides = overrides;
    return exports.ProjectMediaViewer({ projectId: 'project', projectTitle: 'Work', attachments, pageCount: null,
      responseRailWidth: { width: panel === 'response' ? 320 : 52 }, singlePanel: null, readOnlyShare,
      mobileNavigation: mobile ? { index, isIndexOpen: panel === 'index', onOpenIndex: () => { panel = 'index'; }, onCloseIndex: () => { panel = null; }, onBack } : undefined,
      isRailOpen: panel === 'response', onRailOpenChange: open => { panel = open ? 'response' : null; },
      processing: { resolveState: () => 'ready', resolveMessage: () => '', canRetry: () => false, retrying: [] }, onClose,
      ...overrides,
    });
  } };
}

test('project audio interruption belongs to the active video, including on shared catalogues', () => {
  for (const readOnlyShare of [true, false]) {
    const h = harness({ lifecycle: true, mediaKind: 'image', readOnlyShare });
    const attachments = [...h.attachments, { id: 'video', kind: 'video', displayName: 'Clip', typeLabel: 'Video' }];
    let tree = h.commitFocusedPage(null, { attachments });
    assert.deepEqual(h.audioInterruptions, []);
    button(tree, 'Clip, Video').props.onClick();
    tree = h.commitFocusedPage(null);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.videoActive, true);
    assert.deepEqual(h.audioInterruptions, ['video opened']);
    h.setScreenActive(false);
    tree = h.commitFocusedPage(null);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.videoActive, false);
    assert.deepEqual(h.audioInterruptions, ['video opened', 'video left']);
    h.setScreenActive(true);
    tree = h.commitFocusedPage(null);
    button(tree, 'first, Video').props.onClick();
    h.commitFocusedPage(null);
    assert.deepEqual(h.audioInterruptions, ['video opened', 'video left', 'video opened', 'video left']);
  }
});

test('project sharing and copying use the official public destination with the current page state', async () => {
  for (const mobile of [true, false]) for (const readOnlyShare of [true, false]) {
    const h = harness({ mobile, readOnlyShare, search: '?media=first&page=2&view=page&via=friend', hash: '#references' });
    const tree = h.render({ primaryPortalId: 'original' });
    const model = h.screenActions.at(-1).model;
    const actions = [...model.primary, ...model.groups.flat()];
    actions.find(action => action.id === 'share').run();
    await actions.find(action => action.id === 'copy').run();
    const expected = 'https://portalinknetworks.com/share/creator/c/original/project?media=first&page=2&view=page&via=friend#references';
    assert.equal(nodes(tree).find(node => node.type === 'project-share-path').props.value,
      (readOnlyShare ? '/share' : '/p') + '/creator/c/original/project');
    assert.equal(h.sharedTargets[0].url, expected);
    assert.deepEqual(h.copies, [expected]);
    assert.equal(h.sharedTargets[0].title, 'Work');
  }
});

test('project overview attaches mobile swipe Back to the work stage and uses navigation rather than media Close', () => {
  const h = harness();
  const tree = h.render(), stage = withProp(tree, 'data-project-stage'), swipe = h.swipeCalls.at(-1);
  assert.equal(swipe.enabled, true);
  assert.equal(swipe.scope, 'project:first');
  assert.equal(stage.ref, swipe.surfaceRef);
  assert.equal(stage.props.onPointerUpCapture, h.swipeHandlers.onPointerUpCapture);
  assert.equal(stage.props.onClickCapture, h.swipeHandlers.onClickCapture);
  assert.equal(swipe.onBack, h.onBack);
  assert.notEqual(swipe.onBack, nodes(tree).find(node => node.type === AttachmentRenderer).props.onClose);
  swipe.onBack();
  assert.deepEqual(h.navigationCalls, ['back']);
  button(tree, 'second, Video').props.onClick();
  h.render();
  assert.equal(h.swipeCalls.at(-1).scope, 'project:second', 'Switching content must invalidate a gesture from the previous attachment');
});

test('shared project details retain disclosure and content without a layout resize handle', () => {
  const h = harness({ mobile: false, readOnlyShare: true, mediaKind: 'document' });
  const tree = h.render({ isRailOpen: true });
  assert.ok(button(tree, 'Hide project details'));
  assert.ok(button(tree, 'Show project information'));
  assert.ok(nodes(tree).find(node => node.type === AttachmentRenderer));
  assert.equal(nodes(tree).some(node => node.props.label === 'Resize project details. Double-click to restore the default width.'), false);
});

test('video scrolling remembers its attachment before canonical navigation and opens mixed-media targets without a first-frame fallback', () => {
  for (const readOnlyShare of [false, true]) {
    const h = harness({ readOnlyShare }), navigations = [];
    const creator = { name: 'Source creator', avatar: 'source-creator-avatar.jpg' };
    const image = { id: 'target-image', kind: 'image', displayName: 'Artwork', typeLabel: 'Image' };
    const targetVideos = ['target-video', 'target-video-2'].map(id => ({ id, kind: 'video', displayName: id, typeLabel: 'Video' }));
    const entries = [
      { projectId: 'project', projectTitle: 'Work', attachment: h.attachments[0] },
      ...targetVideos.map(attachment => ({ projectId: 'target', projectTitle: 'Target project', attachment })),
    ];
    const memoryScope = readOnlyShare ? 'shared' : 'workspace';
    const videoSequence = { scope: `${memoryScope}:creator:portal`, entries, onSelectProject(id) {
      assert.equal(h.viewerMemory.get(`${memoryScope}:project:${id}`).activeAttachmentId, 'target-video',
        'The selected video must already be remembered when the route handler runs');
      navigations.push(id);
    } };
    const sequence = tree => nodes(tree).find(node => node.type === MobileVideoSequence);
    const openingTree = h.render({ videoSequence, creator });
    const opening = sequence(openingTree);
    assert.equal(opening.props.activeId, 'project:first');
    assert.equal(opening.props.creator, creator);
    assert.equal(nodes(openingTree).some(node => node.type === MobileVideoFrame), false,
      'A queue owns one metadata frame per entry, without an extra frame around the entire queue');
    opening.props.onSelect(entries[1]);
    assert.deepEqual(navigations, ['target']);
    assert.deepEqual(h.memoryWrites.at(-1), [`${memoryScope}:project:target`, 'target-video']);

    const targetProps = { videoSequence, creator, projectId: 'target', projectTitle: 'Target project', attachments: [image, ...targetVideos] };
    // This harness does not run effects: this is the target route's first render.
    const target = sequence(h.render(targetProps));
    assert.ok(target, 'The video sequence must remain mounted although the target project begins with an image');
    assert.equal(target.key, opening.key, 'Cross-project navigation retains the same sequence identity');
    assert.equal(target.props.activeId, 'target:target-video');
    assert.equal(target.props.creator, creator, 'Canonical project navigation retains the source creator');
    assert.deepEqual(h.serviceIds.slice(-2), readOnlyShare ? [null, null] : ['target', 'target']);
    const playing = target.props.renderVideo(entries[1], true);
    assert.equal(playing.props.projectId, 'target');
    assert.equal(playing.props.attachment.id, 'target-video');
    assert.equal(playing.props.projectTitle, 'Target project');
    assert.equal(playing.props.videoActive, true);
    assert.equal(playing.props.showMediaInteractions, !readOnlyShare);
    assert.equal(target.props.renderVideo(entries[0], false).props.projectTitle, 'Work',
      'Neighboring clips retain their own project titles after the active project changes');
    assert.equal(target.props.renderVideo(entries[0], false).props.videoActive, false);
    assert.equal(target.props.renderVideo(entries[0], false).props.showMediaInteractions, !readOnlyShare,
      'Neighboring clips follow the same shared-reader engagement boundary');

    target.props.onSelect(entries[2]);
    assert.deepEqual(navigations, ['target'], 'Changing videos inside one project does not navigate again');
    assert.equal(sequence(h.render(targetProps)).props.activeId, 'target:target-video-2');
    assert.deepEqual(h.memoryWrites.at(-1), [`${memoryScope}:project:target`, 'target-video-2']);
  }
});

test('single mobile videos use their project title and source creator with or without a one-entry queue', () => {
  for (const readOnlyShare of [false, true]) {
    for (const hasQueue of [false, true]) {
      const h = harness({ readOnlyShare });
      const creator = { name: 'The uploader', avatar: 'uploader-avatar.jpg' };
      const attachment = { ...h.attachments[0], displayName: 'camera-original-file.mp4' };
      const projectTitle = 'The uploaded project';
      const videoSequence = hasQueue ? { scope: 'creator:portal', entries: [
        { projectId: 'project', projectTitle, attachment },
      ], onSelectProject() { assert.fail('A single video must not navigate through a queue'); } } : undefined;
      const tree = h.render({ creator, projectTitle, attachments: [attachment], videoSequence });
      const frames = nodes(tree).filter(node => node.type === MobileVideoFrame);
      assert.equal(frames.length, 1);
      assert.equal(frames[0].props.creator, creator);
      assert.equal(frames[0].props.sourceTitle, projectTitle);
      assert.notEqual(frames[0].props.sourceTitle, attachment.displayName);
      assert.equal(frames[0].props.children.type, AttachmentRenderer);
      assert.equal(frames[0].props.children.props.attachment, attachment);
      assert.equal(frames[0].props.children.props.showMediaInteractions, !readOnlyShare);
      assert.equal(nodes(tree).some(node => node.type === MobileVideoSequence), false);
    }
  }
});

test('video metadata and sequences leave WEB and non-video mobile attachments in their existing viewers', () => {
  for (const options of [{ mobile: false }, { mediaKind: 'document' }, { mediaKind: 'image' }, { mediaKind: 'audio' }]) {
    const h = harness(options);
    const videoSequence = { scope: 'creator:portal', entries: [
      { projectId: 'project', attachment: { id: 'video-one', kind: 'video' } },
      { projectId: 'other', attachment: { id: 'video-two', kind: 'video' } },
    ], onSelectProject() { assert.fail('Unrelated viewers must not navigate through videos'); } };
    const tree = h.render({ attachments: [h.attachments[0]], videoSequence, creator: { name: 'Source creator', avatar: 'creator.jpg' } });
    assert.equal(nodes(tree).some(node => node.type === MobileVideoSequence), false);
    assert.equal(nodes(tree).some(node => node.type === MobileVideoFrame), false);
    assert.equal(nodes(tree).some(node => node.props.className === 'mobile-video-single'), false);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.attachment, h.attachments[0]);
  }
});

test('mobile overview Back yields to focused pages, the project index and response popups', () => {
  const h = harness();
  let tree = h.render();
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(true);
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, false);
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(false);
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, true);
  h.openIndex();
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, false);
  button(tree, 'Close project list').props.onClick();
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, true);
  for (const label of ['Show comments', 'Show project description']) {
    button(tree, label).props.onClick();
    tree = h.render();
    assert.equal(h.swipeCalls.at(-1).enabled, false);
    if (label === 'Show project description') nodes(tree).find(node => node.type === FollowContentInfoPopup).props.onClose();
    else button(tree, 'Close project popup').props.onClick();
    tree = h.render();
    assert.equal(h.swipeCalls.at(-1).enabled, true);
  }
});

function assertFocusedControls(h, tree, focused) {
  assert.equal(withProp(tree, 'data-immersive').props['data-immersive'], String(focused));
  assert.equal(nodes(tree).find(node => node.type === MobileProjectPageCounter).props.showControl, !focused,
    'Only the focused renderer owns its counter while a page is focused');
  assert.equal(nodes(tree).some(node => node.props.className === 'mobile-content-action-bar'), !focused,
    'The normal project dock must not overlap the focused media controls');
  assert.equal(h.swipeCalls.at(-1).enabled, !focused,
    'Overview Back gestures remain available for documents and yield to focused pages');
}

test('restored MOBILE image focus survives child-before-parent passive effects in workspace and public readers', () => {
  for (const readOnlyShare of [false, true]) {
    const reports = [], h = harness({ lifecycle: true, mediaKind: 'image', readOnlyShare, search: '?media=first&page=2&view=page' });
    const props = { onPageFocusModeChange: value => reports.push(value) };
    const tree = h.commitFocusedPage(true, props);
    assertFocusedControls(h, tree, true);
    assert.equal(reports.at(-1), true, 'The containing profile must also hide its ordinary Back control');
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.showMediaInteractions, !readOnlyShare,
      'Public restored focus retains the existing read-only interaction boundary');
  }
  const legacy = harness({ lifecycle: true, mediaKind: 'image', search: '?media=first&page=2&view=page', sourceTransform(source) {
    const restoredPassiveReset = source.replace(/useLayoutEffect\(\(\) => \{\s*setIsImmersive\(false\);/, 'useEffect(() => { setIsImmersive(false);');
    assert.notEqual(restoredPassiveReset, source, 'The regression control must change only the attachment-focus reset phase');
    return restoredPassiveReset;
  } });
  assert.equal(withProp(legacy.commitFocusedPage(true), 'data-immersive').props['data-immersive'], 'false',
    'Restoring the old passive reset in memory reproduces the lost child focus report');
});

test('MOBILE restored focus is re-reported after a callback, project or viewer scope changes', () => {
  for (const readOnlyShare of [false, true]) {
    const original = [], replacement = [], h = harness({ lifecycle: true, mediaKind: 'image', readOnlyShare, search: '?media=first&page=2&view=page' });
    h.commitFocusedPage(true, { onPageFocusModeChange: value => original.push(value) });
    const props = { onPageFocusModeChange: value => replacement.push(value) };
    let tree = h.commitFocusedPage(true, props);
    assertFocusedControls(h, tree, true);
    assert.equal(replacement.at(-1), true, 'Callback replacement cannot reset an already focused child');
    const reportsBeforeProjectChange = replacement.length;
    tree = h.commitFocusedPage(true, { ...props, projectId: 'another-project' });
    assertFocusedControls(h, tree, true);
    assert.ok(replacement.length > reportsBeforeProjectChange, 'The same attachment id in another project has a new focus scope');
    assert.equal(replacement.at(-1), true);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.projectId, 'another-project');
    const reportsBeforeViewerChange = replacement.length;
    tree = h.commitFocusedPage(true, { ...props, projectId: 'another-project', readOnlyShare: !readOnlyShare });
    assertFocusedControls(h, tree, true);
    assert.ok(replacement.length > reportsBeforeViewerChange, 'A shared/workspace transition must re-report even for the same focused page object');
    assert.equal(replacement.at(-1), true);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.memoryScope, readOnlyShare ? 'workspace' : 'shared');
  }
});

test('leaving MOBILE image focus restores normal controls and switching attachments clears focused ownership', () => {
  for (const readOnlyShare of [false, true]) {
    const reports = [], h = harness({ lifecycle: true, mediaKind: 'image', readOnlyShare, search: '?media=first&page=2&view=page' });
    const attachments = [h.attachments[0], { ...h.attachments[1], kind: 'document', typeLabel: 'Document' }];
    const props = { attachments, onPageFocusModeChange: value => reports.push(value) };
    assertFocusedControls(h, h.commitFocusedPage(true, props), true);
    let tree = h.commitFocusedPage(false, props);
    assertFocusedControls(h, tree, false);
    assert.equal(reports.at(-1), false);
    button(tree, 'second, Document').props.onClick();
    tree = h.commitFocusedPage(null, props);
    assertFocusedControls(h, tree, false);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.attachment.id, 'second');
    assert.equal(reports.at(-1), false);
  }
});

const readingParts = tree => nodes(withProp(tree, 'data-project-stage')).filter(node => node.props.renderer).map(node => node.props);

test('MOBILE opens the cover and PDF in one vertical reader on both project routes', () => {
  for (const readOnlyShare of [false, true]) {
    const h = harness({ lifecycle: true, mediaKind: 'image', readOnlyShare });
    const [cover, pdf] = mixedCoverPdf(h.attachments);
    const scope = readOnlyShare ? 'shared' : 'workspace';
    h.viewerMemory.set(`${scope}:project:project`, { activeAttachmentId: cover.id });
    const tree = h.commitFocusedPage(false, { attachments: [cover, pdf] });
    const stage = withProp(tree, 'data-project-stage');
    const [image, document] = readingParts(tree);
    assert.equal(image.renderer.attachment, cover);
    assert.equal(document.renderer.attachment, pdf);
    assert.equal(h.readingScroll.at(-1)[0], true, 'The stage owns overview scroll before the PDF loads');
    assert.equal(withProp(tree, 'data-project-file-strip'), undefined);
    const counter = nodes(tree).find(node => node.type === MobileProjectPageCounter);
    assert.equal(counter.props.surfaceRef, stage.ref, 'One page navigator includes the cover and PDF');
    assert.equal(counter.props.scope, 'project:ordered-pages');
    const focused = h.commitFocusedPage(true);
    assert.equal(readingParts(focused)[0].hidden, true);
    assert.equal(readingParts(h.commitFocusedPage(false))[0].hidden, false);
  }
});

function mixedCoverPdf([cover, pdf]) {
  return [
    { ...cover, sourceUrl: '/cover.png', typeLabel: 'Image', isCover: true },
    { ...pdf, kind: 'document', sourceUrl: '/report.pdf', typeLabel: 'PDF' }
  ];
}

function openingMedia(state, top = 0, height = 400) {
  return {
    dataset: { readerMediaState: state },
    getBoundingClientRect: () => ({ top, bottom: top + height, left: 0, right: 420, width: 420, height }),
  };
}

test('MOBILE ordered projects reveal after the first visible page and keep later pages loading in place', () => {
  let media = [openingMedia('pending'), openingMedia(undefined, 400)];
  const openingStage = {
    querySelectorAll: () => media,
    querySelector: () => media.find(node => node.dataset.readerMediaState === 'pending'),
  };
  const h = harness({ lifecycle: true, mediaKind: 'image', readOnlyShare: true, openingStage });
  const tree = h.commitFocusedPage(null, { attachments: mixedCoverPdf(h.attachments) });
  assert.equal(nodes(tree).filter(node => node.type === ProjectOpeningLoader).length, 1);
  assert.equal(withProp(tree, 'data-project-opening').props['aria-busy'], true);
  assert.equal(readingParts(tree).length, 2, 'All ordered parts can load beneath the one indicator');
  h.inspectOpeningFrame();
  assert.equal(withProp(h.commitFocusedPage(null), 'data-project-opening').props['data-project-opening'], true,
    'A second page painting first cannot reveal the pending first page');

  media = [openingMedia(undefined), openingMedia('pending', 400)];
  h.inspectOpeningFrame();
  const loaded = h.commitFocusedPage(null);
  assert.equal(withProp(loaded, 'data-project-opening').props['aria-busy'], undefined);
  assert.equal(nodes(loaded).some(node => node.type === ProjectOpeningLoader), false);

  media = [openingMedia('pending')];
  h.inspectOpeningFrame();
  assert.equal(withProp(h.commitFocusedPage(true), 'data-project-opening').props['data-project-opening'], undefined,
    'Lazy pages or a page-focus change do not restore the opening overlay');
});

test('MOBILE retained reader waits for its new project and reveals the visible retry surface on failure', () => {
  let media = [openingMedia(undefined)];
  const openingStage = {
    querySelectorAll: () => media,
    querySelector: () => media.find(node => node.dataset.readerMediaState === 'pending'),
  };
  const h = harness({ lifecycle: true, mediaKind: 'image', openingStage, search: '?media=first&page=2&view=page' });
  h.commitFocusedPage(true);
  h.inspectOpeningFrame();
  assert.equal(withProp(h.commitFocusedPage(true), 'data-project-opening').props['data-project-opening'], undefined,
    'Already painted deep-linked content releases the opening loader');

  media = [openingMedia(undefined, -400), openingMedia('pending')];
  assert.equal(withProp(h.commitFocusedPage(true, { projectId: 'another-project' }), 'data-project-opening').props['data-project-opening'], true);
  h.inspectOpeningFrame();
  assert.equal(withProp(h.commitFocusedPage(true), 'data-project-opening').props['data-project-opening'], true,
    'A previously painted page outside the viewport cannot reveal a pending focused page');

  media = [openingMedia('error'), openingMedia('pending', 400)];
  h.inspectOpeningFrame();
  assert.equal(withProp(h.commitFocusedPage(true), 'data-project-opening').props['data-project-opening'], undefined,
    'A visible retry must remain reachable even while later pages are still pending');
});

test('MOBILE continuous reading follows stored order across PDF covers, appendix images and additional PDFs', () => {
  const h = harness({ mediaKind: 'image' });
  const [cover, pdf] = mixedCoverPdf(h.attachments);
  const appendix = { ...cover, id: 'appendix', isCover: false, order: 2 };
  const supplementary = { ...pdf, id: 'supplementary', order: 3 };
  const tree = h.render({ attachments: [supplementary, { ...cover, isCover: false, order: 1 }, { ...pdf, isCover: true, order: 0 }, appendix] });
  assert.deepEqual(readingParts(tree).map(part => part.renderer.attachment.id), [pdf.id, cover.id, appendix.id, supplementary.id]);
  assert.equal(withProp(tree, 'data-project-file-strip'), undefined);
});

test('WEB file switching and explicit MOBILE page links keep their own attachment target', () => {
  for (const [mobile, search, active] of [
    [false, '', 'first'],
    [true, '?media=second&page=1&view=page', 'second'],
  ]) {
    const h = harness({ mobile, search, mediaKind: 'image' });
    const tree = h.render({ attachments: mixedCoverPdf(h.attachments) });
    assert.equal(readingParts(tree).length, 0);
    assert.ok(withProp(tree, 'data-project-file-strip'));
    const renderer = nodes(tree).find(node => node.type === AttachmentRenderer);
    assert.equal(renderer.props.attachment.id, active);
    assert.equal(renderer.props.verticalReading, mobile && active === 'first');
  }
  for (const [id, page] of [['first', 1], ['second', 2]]) {
    const linked = harness({ mediaKind: 'image', search: `?media=${id}&page=${page}` });
    const tree = linked.render({ attachments: mixedCoverPdf(linked.attachments) });
    assert.deepEqual(readingParts(tree).map(part => part.renderer.attachment.id), ['first', 'second']);
    assert.equal(withProp(tree, 'data-project-file-strip'), undefined);
    assert.deepEqual(linked.readingScroll.at(-1).slice(3), [page, id]);
  }
});

test('WEB focus lifecycle retains its existing rail without MOBILE controls', () => {
  for (const readOnlyShare of [false, true]) {
    const reports = [], h = harness({ lifecycle: true, mobile: false, mediaKind: 'image', readOnlyShare, search: '?media=first&page=2&view=page' });
    const sharedDesktopRailStyle = { '--navigation-surface': '#eeeeee' };
    const props = { sharedDesktopRailStyle, onPageFocusModeChange: value => reports.push(value) };
    for (const focused of [true, false]) {
      const tree = h.commitFocusedPage(focused, props);
      assert.equal(withProp(tree, 'data-immersive').props['data-immersive'], String(focused));
      assert.equal(reports.at(-1), focused);
      const rail = withProp(tree, 'data-project-response-rail');
      assert.ok(rail, 'The existing desktop rail remains mounted');
      assert.equal(rail.props.style['--navigation-surface'], readOnlyShare ? sharedDesktopRailStyle['--navigation-surface'] : undefined);
      assert.equal(nodes(tree).some(node => node.type === MobileProjectPageCounter || node.props.className === 'mobile-content-action-bar'), false);
    }
  }
});

test('overview swipe Back remains available on public mobile content but is disabled on WEB and 3D media', () => {
  const shared = harness({ readOnlyShare: true });
  shared.render();
  assert.equal(shared.swipeCalls.at(-1).enabled, true);
  assert.equal(shared.swipeCalls.at(-1).onBack, shared.onBack);
  const document = harness({ mediaKind: 'document' });
  document.render();
  assert.equal(document.swipeCalls.at(-1).enabled, true, 'Vertical document overview accepts a centre swipe Back');
  const web = harness({ mobile: false });
  web.render();
  assert.equal(web.swipeCalls.at(-1).enabled, false);
  assert.equal(web.swipeCalls.at(-1).onBack, undefined);
  const model = harness({ mediaKind: 'model3d' });
  model.render();
  assert.equal(model.swipeCalls.at(-1).enabled, false, 'Model manipulation must retain its horizontal gestures');
});

test('mobile keeps selected media while opening its floating project list and separate response popups', () => {
  const h = harness();
  let tree = h.render();
  button(tree, 'second, Video').props.onClick();
  tree = h.render();
  const work = withProp(tree, 'data-project-work-column');
  const media = nodes(work).find(node => node.type === AttachmentRenderer);
  assert.equal(media.props.attachment.id, 'second');
  h.openIndex();
  tree = h.render();
  assert.ok(withProp(tree, 'data-project-index-panel'));
  assert.equal(withProp(tree, 'data-project-response-rail'), undefined);
  assert.equal(withProp(tree, 'data-project-work-column').type, work.type);
  assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.attachment.id, 'second');
  assert.ok(button(tree, 'Collapse document list'));
  button(tree, 'Close project list').props.onClick();
  tree = h.render();
  assert.equal(withProp(tree, 'data-project-index-panel'), undefined);
  assert.ok(withProp(tree, 'data-project-response-rail'));
  button(tree, 'Show comments').props.onClick();
  tree = h.render();
  assert.ok(nodes(tree).some(node => node.type === CommentThreadView));
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.label, 'Project comments');
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.mobileMotion, true);
  button(tree, 'Close project popup').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).some(node => node.type === MediaCommentsPopover), false);
  button(tree, 'Show project description').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === FollowContentInfoPopup).props.projectId, 'project');
  assert.equal(nodes(tree).some(node => node.type === CommentThreadView), false);
  assert.equal(withProp(tree, 'data-project-work-column').props.style.display, undefined);
  h.openIndex();
  assert.equal(withProp(h.render(), 'data-project-response-rail'), undefined);
});

test('mobile engagement failures keep the recovery popup accessible', () => {
  const h = harness({ engagement: { resolveError: 'Could not load engagement' } });
  button(h.render(), 'Review engagement error').props.onClick();
  const tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.label, 'Engagement update');
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.mobileMotion, false);
  assert.ok(nodes(tree).some(node => node.type === EngagementFeedback));
});

test('mobile verification retains its immediate sheet dismissal instead of opting into comments motion', () => {
  const h = harness({ readOnlyShare: true });
  button(h.render(), 'Show AI verification services').props.onClick();
  const tree = h.render(), sheet = nodes(tree).find(node => node.type === MediaCommentsPopover);
  assert.equal(sheet.props.label, 'AI verification'); assert.equal(sheet.props.mobileMotion, false);
  button(tree, 'Close project popup').props.onClick();
  assert.equal(nodes(h.render()).some(node => node.type === MediaCommentsPopover), false);
});

test('the mobile action opens project information without changing WEB rail preferences', () => {
  for (const readOnlyShare of [false,true]) {
    const h=harness({readOnlyShare});
    const props={onRailOpenChange:()=>assert.fail('Information must not resize the WEB rail')};
    const opening = h.render(props);
    button(opening, readOnlyShare ? 'Show project information' : 'Show project engagement').props.onClick();
    const tree=h.render(props),sheet=nodes(tree).find(node=>node.type===FollowContentInfoPopup);
    assert.equal(sheet.props.projectId,'project');
    assert.equal(sheet.props.showEngagement,!readOnlyShare);
    assert.equal(withProp(tree,'data-mobile-engagement-content').props.hidden,true);
    sheet.props.onClose();
    assert.equal(nodes(h.render(props)).some(node=>node.type===FollowContentInfoPopup),false);
  }
});

test('project information owns dismissal while its obsolete inline rail stays closed', () => {
  const h=harness();button(h.render(),'Show project engagement').props.onClick();
  const tree=h.render();
  assert.equal(h.outsideCalls.at(-1).open,false);
  withProp(tree,'data-project-response-rail').props.onKeyDown({key:'Escape',preventDefault(){assert.fail('Modal owns Escape')},stopPropagation(){}});
  nodes(tree).find(node=>node.type===FollowContentInfoPopup).props.onClose();
  assert.equal(h.swipeCalls.at(-1).enabled,false);
  h.render();assert.equal(h.swipeCalls.at(-1).enabled,true);
});

test('opening the project index closes information and retains the selected attachment', () => {
  const h=harness();button(h.render(),'second, Video').props.onClick();
  button(h.render(),'Show project engagement').props.onClick();h.render();h.openIndex();
  const tree=h.render();assert.equal(nodes(tree).some(node=>node.type===FollowContentInfoPopup),false);
  assert.equal(nodes(tree).find(node=>node.type===AttachmentRenderer).props.attachment.id,'second');
  assert.equal(withProp(tree,'data-project-response-rail'),undefined);
});

test('WEB retains its response rail without the mobile engagement toggle for workspace and public views', () => {
  for (const readOnlyShare of [false, true]) {
    const h = harness({ mobile: false, readOnlyShare });
    const tree = h.render();
    assert.equal(button(tree, 'Show project engagement'), undefined);
    assert.equal(button(tree, 'Hide project engagement'), undefined);
    assert.equal(withProp(tree, 'data-mobile-engagement-content'), undefined);
    assert.ok(withProp(tree, 'data-project-response-rail'));
    assert.equal(h.outsideCalls.at(-1).open, false);
  }
});

test('empty mobile projects keep their project-list access; WEB keeps its existing empty state', () => {
  const mobile = harness({ empty: true });
  mobile.openIndex();
  assert.ok(withProp(mobile.render(), 'data-project-index-panel'));
  const web = harness({ mobile: false, empty: true }).render();
  assert.equal(withProp(web, 'data-project-response-rail'), undefined);
  assert.equal(button(web, 'Show project list'), undefined);
});

test('shared readers hide project and media engagement for signed-in and guest visitors on MOBILE and WEB', () => {
  for (const mobile of [true, false]) for (const signedIn of [true, false]) for (const mediaKind of ['document', 'image', 'video']) {
    const h = harness({ mobile, signedIn, mediaKind, readOnlyShare: true });
    const props = { attachments: [h.attachments[0]], isRailOpen: true, isOwner: true, descriptionEditor: { open() { assert.fail('Public readers cannot edit'); } },
      onDeleteProject() { assert.fail('Public readers cannot delete'); } };
    let tree = h.render(props);
    const media = nodes(tree).find(node => node.type === AttachmentRenderer);
    assert.equal(media.props.showMediaInteractions, false, `${mobile ? 'MOBILE' : 'WEB'} ${mediaKind} hides per-media engagement`);
    assert.equal(media.props.isOwner, false);
    assert.equal(media.props.memoryScope, 'shared');
    if (mobile && mediaKind === 'document') {
      const counter = nodes(tree).find(node => node.type === MobileProjectPageCounter);
      counter.props.onPositionChange({ scope: counter.props.scope, current: 2, total: 4, ready: true });
      tree = h.render(props);
      assert.equal(nodes(tree).find(node => node.type === 'mobile-page-context').props.value.pageIndex, 1,
        'The document has an active page, so its missing interaction bar is intentional');
    }
    for (const component of [EngagementBar, EngagementFeedback, CommentThreadView, MediaCommentsPopover, 'media-interaction-bar']) {
      assert.equal(nodes(tree).some(node => node.type === component), false, 'No shared engagement or comments surface is mounted');
    }
    for (const label of ['Show comments', 'Show project engagement', 'Hide project engagement', 'Review engagement error']) {
      assert.equal(button(tree, label), undefined, `Public readers omit ${label}`);
    }
    assert.equal(nodes(tree).some(node => node.type === 'button' && node.props.children === 'Show comments'), false,
      'The expanded WEB rail does not retain its text-only comments toggle');
    const actions = h.screenActions.at(-1).model;
    assert.equal([...actions.primary, ...actions.groups.flat()].some(action => ['saveProject', 'savePage', 'comment'].includes(action.id)), false);
    assert.equal(actions.target.handlers.saveProject, undefined, 'A shell action merge cannot reintroduce public saving');
    assert.ok(h.serviceIds.length >= 2);
    assert.ok(h.serviceIds.every(id => id === null), 'Public readers disable engagement and comments queries');
    assert.deepEqual(h.gates, []);
    assert.ok(withProp(tree, 'data-project-response-rail'), 'Public details and navigation retain their existing rail');
  }
});

test('shared readers do not expose engagement recovery controls even when the disabled hook has stale errors', () => {
  for (const mobile of [true, false]) for (const signedIn of [true, false]) {
    const h = harness({ mobile, signedIn, readOnlyShare: true,
      engagement: { resolveError: 'A stale engagement failure', failure: 'A stale update failure' } });
    const tree = h.render({ isRailOpen: true });
    assert.equal(button(tree, 'Review engagement error'), undefined);
    assert.equal(nodes(tree).some(node => node.type === EngagementFeedback || node.type === MediaCommentsPopover), false);
  }
});

test('shared MOBILE information remains readable and dismissible without engagement or account prompts', () => {
  for (const signedIn of [true, false]) {
    const h = harness({ signedIn, readOnlyShare: true });
    const props = { isOwner: true, descriptionEditor: { open() { assert.fail('Public readers cannot edit'); } },
      onDeleteProject() { assert.fail('Public readers cannot delete'); } };
    button(h.render(props), 'second, Video').props.onClick();
    h.render(props);
    h.screenActions.at(-1).onOpen();
    const tree = h.render(props), info = nodes(tree).find(node => node.type === FollowContentInfoPopup);
    assert.ok(info);
    assert.equal(info.props.projectId, 'project');
    assert.equal(info.props.showEngagement, false);
    assert.equal(info.props.onComments, undefined);
    assert.equal(info.props.onRequireAccount, undefined);
    assert.equal(info.props.optionsContent, undefined);
    info.props.onClose();
    const closed = h.render(props);
    assert.equal(nodes(closed).some(node => node.type === FollowContentInfoPopup), false);
    assert.equal(nodes(closed).find(node => node.type === AttachmentRenderer).props.attachment.id, 'second');
    assert.deepEqual(h.gates, [], 'Reading and dismissing public information does not ask for an account');
  }
});

test('shared WEB retains project information and verification with its engagement controls removed', () => {
  for (const signedIn of [true, false]) {
    const h = harness({ mobile: false, signedIn, readOnlyShare: true });
    let tree = h.render({ isRailOpen: true });
    button(tree, 'Show project information').props.onClick();
    tree = h.render({ isRailOpen: true });
    assert.equal(button(tree, 'Show project information').props['aria-pressed'], true);
    button(tree, 'Show AI verification services').props.onClick();
    tree = h.render({ isRailOpen: true });
    assert.equal(button(tree, 'Show AI verification services').props['aria-pressed'], true);
    assert.equal(nodes(tree).some(node => node.type === EngagementBar || node.type === CommentThreadView), false);
    assert.ok(button(tree, 'Hide project details'));
  }
});

test('ordinary readers retain project engagement, information actions and media interactions', () => {
  for (const mobile of [true, false]) for (const mediaKind of ['document', 'image', 'video']) {
    const h = harness({ mobile, mediaKind });
    const props = { attachments: [h.attachments[0]], isRailOpen: true };
    let tree = h.render(props);
    assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.showMediaInteractions, true);
    assert.ok(nodes(tree).some(node => node.type === EngagementBar));
    assert.ok(h.serviceIds.every(id => id === 'project'));
    assert.equal(typeof h.screenActions.at(-1).model.target.handlers.saveProject, 'function');
    assert.ok(h.screenActions.at(-1).model.primary.some(action => action.id === 'saveProject'));
    if (mobile) {
      assert.ok(button(tree, 'Show comments'));
      if (mediaKind === 'document') {
        const counter = nodes(tree).find(node => node.type === MobileProjectPageCounter);
        counter.props.onPositionChange({ scope: counter.props.scope, current: 2, total: 4, ready: true });
        tree = h.render(props);
        assert.ok(nodes(tree).some(node => node.type === 'media-interaction-bar'), 'Ordinary document pages retain their interaction bar');
      }
      h.screenActions.at(-1).onOpen();
      const info = nodes(h.render(props)).find(node => node.type === FollowContentInfoPopup);
      assert.equal(info.props.showEngagement, true);
      assert.equal(typeof info.props.onComments, 'function');
    }
  }
});

test('WEB does not receive the combined mobile controls or change its response layout', () => {
  const tree = harness({ mobile: false }).render();
  assert.equal(tree.props['data-mobile-combined-rail'], undefined);
  assert.equal(button(tree, 'Show project list'), undefined);
  assert.equal(button(tree, 'Close project list'), undefined);
  assert.ok(withProp(tree, 'data-project-response-rail'));
  assert.ok(nodes(tree).some(node => node.type === EngagementBar));
  assert.equal(nodes(tree).find(node => node.type === EngagementBar).props.variant, 'rail');
  assert.equal(nodes(tree).some(node => node.type === MobileProjectPageCounter), false);
});

test('desktop viewers can select Info and Comments directly from the expanded response rail', () => {
  const h = harness({ mobile: false });
  const projectSummary = 'The creator describes how the project was made.';
  const expanded = { isRailOpen: true, responseRailWidth: { width: 380 }, projectSummary };
  const labeledControl = (tree, label) => nodes(tree).find(node => node.type === 'button' &&
    React.Children.toArray(node.props.children).some(child => child === label || (React.isValidElement(child) && child.props.children === label)));
  let tree = h.render(expanded);
  assert.equal(labeledControl(tree, 'Info').props['aria-pressed'], false);
  assert.equal(labeledControl(tree, 'Comments').props['aria-pressed'], true);
  const contentId = labeledControl(tree, 'Info').props['aria-controls'];
  assert.ok(contentId);
  assert.equal(labeledControl(tree, 'Comments').props['aria-controls'], contentId);
  const content = () => nodes(tree).find(node => node.props.id === contentId);
  assert.ok(nodes(content()).some(node => node.type === CommentThreadView));
  assert.ok(nodes(tree).some(node => node.type === EngagementBar));

  labeledControl(tree, 'Info').props.onClick();
  tree = h.render(expanded);
  assert.equal(labeledControl(tree, 'Info').props['aria-pressed'], true);
  assert.equal(labeledControl(tree, 'Comments').props['aria-pressed'], false);
  assert.ok(nodes(content()).some(node => node.props.text === projectSummary));
  assert.equal(nodes(content()).some(node => node.type === CommentThreadView), false);

  labeledControl(tree, 'Comments').props.onClick();
  tree = h.render(expanded);
  assert.equal(labeledControl(tree, 'Comments').props['aria-pressed'], true);
  assert.ok(nodes(tree).some(node => node.type === CommentThreadView));

  for (const other of [h.render({ isRailOpen: false }), h.render({ ...expanded, isOwner: true }),
    harness({ mobile: false, readOnlyShare: true }).render(expanded), harness({ mobile: true }).render(expanded)]) {
    assert.equal(labeledControl(other, 'Info'), undefined);
    assert.equal(labeledControl(other, 'Comments'), undefined);
  }
});

test('mobile overview uses the reading rail and real-page counter, while focused pages and panels own their controls', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === EngagementBar).props.variant, 'viewer');
  const counter = nodes(tree).find(node => node.type === MobileProjectPageCounter);
  assert.equal(counter.props.surfaceRef, withProp(tree, 'data-project-stage').ref);
  assert.equal(counter.props.scope, 'project:first');
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(true);
  assert.equal(nodes(h.render()).find(node => node.type === MobileProjectPageCounter).props.showControl, false);
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(false);
  h.openIndex();
  tree = h.render();
  assert.equal(nodes(tree).some(node => node.type === MobileProjectPageCounter), false);
  assert.equal(nodes(tree).some(node => node.type === EngagementBar), false);
});

test('mobile page previews use image order, available rendered pages, or the loaded PDF; WEB does not register previews', () => {
  const images = harness({ mediaKind: 'image' });
  images.attachments.forEach((page, index) => { page.sourceUrl = `image-${index + 1}`; });
  const preview = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
  assert.deepEqual(Array.from(preview(images.render()).props.previewSources), ['image-1', 'image-2']);
  const documents = harness({ mediaKind: 'document' });
  documents.attachments.splice(1);
  documents.attachments[0].metadata = { renderedPages: [{ sourceUrl: 'page-1' }, {}, { sourceUrl: 'page-2' }] };
  assert.deepEqual(Array.from(preview(documents.render()).props.previewSources), ['page-1', 'page-2']);
  const pdf = { numPages: 30 };
  nodes(documents.render()).find(node => node.type === AttachmentRenderer).props.onPreviewDocument(pdf);
  assert.equal(preview(documents.render()).props.pdfDocument, pdf);
  nodes(documents.render()).find(node => node.type === AttachmentRenderer).props.onPreviewDocument(null);
  assert.equal(preview(documents.render()).props.pdfDocument, null);
  assert.equal(nodes(harness({ mobile: false }).render()).find(node => node.type === AttachmentRenderer).props.onPreviewDocument, undefined);
});

test('segmented document progress is enabled only for platform mobile readers', () => {
  const counter = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
  const platform = harness({ mediaKind: 'document' });
  platform.attachments.splice(1);
  const platformCounter = counter(platform.render());
  assert.equal(platformCounter.props.readingMode, true);
  assert.equal(platformCounter.props.segmentedProgress, true);
  assert.equal(platformCounter.props.density, undefined, 'progress does not require permission to change density');
  const sharedCounter = counter(harness({ mediaKind: 'document', readOnlyShare: true }).render());
  assert.equal(sharedCounter.props.readingMode, true);
  assert.equal(sharedCounter.props.segmentedProgress, false, 'public mobile keeps its native progress presentation');
  assert.equal(counter(harness({ mediaKind: 'document', mobile: false }).render()), undefined);
  nodes(platform.render()).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(true);
  assert.equal(counter(platform.render()).props.readingMode, false, 'focused zoom retains its own controls');
});

test('mobile density changes document and image columns immediately without waiting for save', () => {
  for (const mediaKind of ['document', 'image']) {
    const h = harness({ mediaKind }), drafts = [], commits = [];
    const props = { pagesPerRow: 7, onPagesPerRowChange: value => drafts.push(value), onPagesPerRowCommit: value => commits.push(value) };
    const media = tree => nodes(tree).find(node => node.type === AttachmentRenderer) ?? { props: readingParts(tree)[0].renderer };
    const counter = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
    let tree = h.render(props);
    assert.equal(media(tree).props.imageColumns, 1, 'each newly opened mobile project starts at full width');
    assert.equal(media(tree).props.verticalReading, true);
    assert.equal(counter(tree).props.density.value, 1);
    counter(tree).props.density.onChange(2);
    tree = h.render(props);
    assert.equal(media(tree).props.imageColumns, 2, 'local layout updates before the parent echoes its draft');
    assert.equal(counter(tree).props.density.value, 2);
    assert.deepEqual(drafts, [2]);
    assert.deepEqual(commits, []);
    counter(tree).props.density.onCommit(2);
    assert.deepEqual(commits, [2]);
    tree = h.render({ ...props, savingPageLayout: true, pagesPerRow: 9 });
    assert.equal(counter(tree).props.density.saving, true);
    assert.equal(media(tree).props.imageColumns, 2, 'a saved design refresh does not reset local reading');
    counter(tree).props.density.onChange(100);
    tree = h.render(props);
    assert.equal(media(tree).props.imageColumns, pageLayout.MAX_PAGES_PER_ROW);
    counter(tree).props.density.onChange(-5);
    tree = h.render(props);
    assert.equal(media(tree).props.imageColumns, pageLayout.MIN_PAGES_PER_ROW);
    counter(tree).props.density.onCommit(100);
    assert.equal(commits.at(-1), pageLayout.MAX_PAGES_PER_ROW);
  }
});

test('mobile density is scoped to the open project and attachment and member changes stay local', () => {
  const h = harness({ mediaKind: 'document' }), drafts = [];
  h.attachments.push({ id: 'audio', kind: 'audio', displayName: 'Audio' });
  const props = { pagesPerRow: 5, onPagesPerRowChange: value => drafts.push(value) };
  const media = tree => nodes(tree).find(node => node.type === AttachmentRenderer);
  const counter = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
  let tree = h.render(props);
  counter(tree).props.density.onChange(3);
  counter(tree).props.density.onCommit(3); // Member has no persistence callback.
  tree = h.render(props);
  assert.equal(media(tree).props.imageColumns, 3);
  button(tree, 'second, Video').props.onClick();
  tree = h.render(props);
  assert.equal(media(tree).props.attachment.id, 'second');
  assert.equal(media(tree).props.imageColumns, 1);
  counter(tree).props.density.onChange(2);
  tree = h.render({ ...props, projectId: 'another-project' });
  assert.equal(counter(tree).props.scope, 'another-project:first');
  assert.equal(media(tree).props.imageColumns, 1);
  assert.deepEqual(drafts, [3, 2]);
  media(tree).props.onFocusModeChange(true);
  tree = h.render({ ...props, projectId: 'another-project' });
  assert.equal(counter(tree).props.showControl, false, 'explicit zoom retains ownership of its controls');
  h.openIndex();
  assert.equal(counter(h.render(props)), undefined, 'the portal popup does not receive the reading pill');
});

test('public readers retain a density slider; WEB, non-page media and callback-free readers keep existing controls', () => {
  const callbacks = { pagesPerRow: 7, onPagesPerRowChange() { assert.fail('No draft'); }, onPagesPerRowCommit() { assert.fail('No save'); } };
  for (const mediaKind of ['image', 'document']) {
    const shared = harness({ mediaKind, readOnlyShare: true }).render(callbacks);
    assert.equal(nodes(shared).find(node => node.type === MobileProjectPageCounter).props.density.value, 1);
    assert.equal((nodes(shared).find(node => node.type === AttachmentRenderer)?.props ?? readingParts(shared)[0].renderer).imageColumns, 1);
    const web = harness({ mobile: false, mediaKind }).render(callbacks);
    assert.equal(nodes(web).some(node => node.type === MobileProjectPageCounter), false);
    assert.equal(nodes(web).find(node => node.type === AttachmentRenderer).props.imageColumns, 7);
  }
  for (const mediaKind of ['video', 'audio', 'model3d']) {
    const tree = harness({ mediaKind }).render(callbacks);
    assert.equal(nodes(tree).find(node => node.type === MobileProjectPageCounter).props.density, undefined);
  }
  const noCallbacks = harness({ mediaKind: 'document' }).render();
  assert.equal(nodes(noCallbacks).find(node => node.type === MobileProjectPageCounter).props.density, undefined);
  const single = harness({ mediaKind: 'image' });
  single.attachments.splice(1);
  assert.equal(nodes(single.render(callbacks)).find(node => node.type === MobileProjectPageCounter).props.density, undefined);
});

test('project workspace combines only resolved mobile projects and uses the existing Back callback', () => {
  const compile = (path, require) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, { exports, require, requestAnimationFrame: callback => callback(),
      window: { addEventListener() {}, removeEventListener() {}, setTimeout() {}, clearTimeout() {} },
      document: { addEventListener() {}, removeEventListener() {}, fullscreenElement: null },
    });
    return exports;
  };
  const geometry = compile('../src/utils/projectPanelLayout.ts', () => ({}));
  const { MobilePortalProjectToolbar } = compile('../src/components/profile/MobilePortalProjectToolbar.tsx', name => {
    if (name === 'react') return React;
    if (name.endsWith('/pageLayout')) return { MIN_PAGES_PER_ROW: 1, MAX_PAGES_PER_ROW: 6 };
    return new Proxy({}, { get: () => () => null });
  });
  const toolbar = tree => {
    const control = nodes(tree).find(node => node.type === MobilePortalProjectToolbar);
    return control && control.type(control.props);
  };
  let presentation = 'mobile', workspaceWidth = 390, back = 0, portalReturns = 0, cursor = 0, effectCursor = 0;
  let currentRoute = { kind: 'project', profileId: 'owner', categoryId: 'portal', projectId: 'work' };
  const slots = [], effects = [], pendingEffects = [], selections = [], indexVisibility = [];
  const Viewer = () => null;
  const Index = () => null;
  const IndexPortal = () => null;
  const PageDensity = () => null;
  let arrangementRead = {}, typographyRead = {};
  const react = { ...React, useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo: fn => fn(), useCallback: fn => fn, useRef: current => ({ current }),
    useEffect(fn, deps) {
      const i = effectCursor++;
      if (!effects[i] || deps.some((value, j) => !Object.is(value, effects[i][j]))) pendingEffects.push(fn);
      effects[i] = deps;
    } };
  const { ProfileCategoryPage } = compile('../src/components/profile/ProfileCategoryPage.tsx', name => {
    if (name.endsWith('/projectPortals')) return compile('../src/features/projects/projectPortals.ts', () => ({}));
    if (name.endsWith('/ExportSheet')) return {ExportSheet:'export-sheet'};
    if (name === 'react') return react;
    if (name.endsWith('/contextActions')) return actionMap;
    if (name.endsWith('/useProjectReach')) return { useProjectReach() {} };
    if (name === 'react-router-dom') return { useNavigate: () => () => {} };
    if (name.endsWith('/app/routes')) return { buildPath: (kind, {profileId}) => `${kind}:${profileId}` };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ isAuthenticated: signedIn, requestAuthenticatedDestination: (intent,view) => gates.push({intent,view}), isInitializing: false, viewerProfileId: null }) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useAppRoute')) return { useAppRoute: () => currentRoute };
    if (name.endsWith('/projectPanelLayout')) return geometry;
    if (name.endsWith('/useElementSize')) return { useElementSize: () => ({ ref: { current: null }, width: workspaceWidth }) };
    if (name.endsWith('/ResizablePanelHandle')) return { ResizablePanelHandle: () => null, useResizablePanelWidth: () => ({ preferredWidth: 315 }) };
    if (name.endsWith('/ProjectMediaViewer')) return { ProjectMediaViewer: Viewer };
    if (name.endsWith('/ProjectPagesPerRowControl')) return { ProjectPagesPerRowControl: PageDensity };
    if (name.endsWith('/MobileProjectIndexPortal')) return { MobileProjectIndexPortal: IndexPortal };
    if (name.endsWith('/ProjectIndexList')) return { ProjectIndexList: Index };
    if (name.endsWith('/MobilePortalProjectToolbar')) return { MobilePortalProjectToolbar };
    if (name.endsWith('/portalProjectBrowsing')) return portalBrowsing;
    if (name.endsWith('/viewer')) return { canAuthor: role => role === 'owner' };
    if (name.endsWith('/useProjectArrangement')) return { useProjectArrangement: () => ({ arrange: projects => Object.freeze(projects), pinnedIds: [], hiddenIds: [], isLoading: false, isSaving: false, ...arrangementRead }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ deletion: { projectId: null }, editor: {} }) };
    if (name.endsWith('/useProjectTypography')) return { useProjectTypography: () => ({ resolveTypefaceId: () => null, resolvePagesPerRow: () => 3, ...typographyRead }) };
    if (name.endsWith('/typefaces')) return { getTypefaceStack: () => 'sans-serif' };
    if (name.endsWith('/projectAttachments')) return { resolveProjectAttachments: project => project.attachments ?? [] };
    if (name.endsWith('/pageLayout')) return { normalizePagesPerRow: value => value };
    if (name.endsWith('/useAssetProcessing')) return { useAssetProcessing: () => ({ statuses: {} }) };
    if (name.endsWith('/panelLayoutDefaults')) return { panelLayoutDefaults: {} };
    return new Proxy({}, { get: () => () => null });
  });
  const props = { profile: { id: 'owner', name: 'Viewed creator', avatar: 'viewed-creator-avatar.jpg', categories: [{ id: 'portal' }], projects: Object.freeze([
      { id: 'work', categoryId: 'portal', title: 'Alpha', summary: 'Earlier project', publishedAt: '2026-09-10T12:00:00Z', pageCount: 2,
        attachments: [{ id: 'work-image', kind: 'image' }, { id: 'work-video', kind: 'video' }] },
      { id: 'second', categoryId: 'portal', title: 'Zulu', summary: 'Needle in the newer project', publishedAt: '2026-09-14T12:00:00Z', pageCount: 2,
        attachments: [{ id: 'second-video', kind: 'video' }, { id: 'second-audio', kind: 'audio' }] },
    ]) },
    category: { id: 'portal', label: 'Portal', iconName: 'camera' }, viewerRole: 'visitor', activeProjectId: 'work',
    onBack: () => back++, onBackToPortals: () => portalReturns++, onSelectProject(id, replace) { selections.push([id, replace]); props.activeProjectId = id; },
    isIndexCollapsed: true, isEngagementOpen: false,
    onCreateProject: () => {}, onMobileIndexOpenChange: open => indexVisibility.push(open),
    onIndexCollapsedChange: () => assert.fail('Mobile must not write WEB panel preferences'),
    onEngagementOpenChange: () => assert.fail('Mobile must not write WEB panel preferences') };
  const render = values => {
    cursor = 0; effectCursor = 0;
    const tree = ProfileCategoryPage(values);
    pendingEffects.splice(0).forEach(effect => effect());
    return tree;
  };
  let tree = render(props);
  assert.equal(indexVisibility.at(-1), false);
  assert.equal(withProp(tree, 'data-project-index-panel'), undefined);
  assert.ok(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.creator.name, props.profile.name,
    'A visitor sees the viewed profile creator, independent of their own account identity');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.creator.avatar, props.profile.avatar);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onBack, props.onBack);
  assert.equal(typeof nodes(tree).find(node => node.type === Viewer).props.onPagesPerRowChange, 'function');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.onPagesPerRowCommit, undefined, 'members cannot persist creator layout');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onBack, button(tree, 'Go back').props.onClick,
    'Swiping and the existing floating Back button must use the same route callback');
  const videoSequence = () => nodes(tree).find(node => node.type === Viewer).props.videoSequence;
  assert.equal(videoSequence().scope, 'workspace:owner:portal');
  assert.deepEqual(Array.from(videoSequence().entries, entry => entry.attachment.id), ['work-video', 'second-video']);
  assert.deepEqual(Array.from(videoSequence().entries, entry => entry.projectTitle), ['Alpha', 'Zulu']);
  arrangementRead = { arrange: projects => projects.filter(project => project.id !== 'hidden').reverse() };
  tree = render({ ...props, profile: { ...props.profile, projects: [
    { id: 'hidden', categoryId: 'portal', title: 'Hidden work', attachments: [{ id: 'hidden-video', kind: 'video' }] },
    ...props.profile.projects,
    { id: 'elsewhere', categoryId: 'other-portal', title: 'Other portal', attachments: [{ id: 'elsewhere-video', kind: 'video' }] },
  ] } });
  assert.deepEqual(Array.from(videoSequence().entries, entry => `${entry.projectId}:${entry.attachment.id}`),
    ['second:second-video', 'work:work-video'], 'Only videos in the arranged, visibility-filtered current portal reach the sequence');
  videoSequence().onSelectProject('second');
  assert.deepEqual(selections.at(-1), ['second', true], 'Scrolling replaces the canonical project route without adding history entries');
  arrangementRead = {};
  props.activeProjectId = 'work';
  tree = render({ ...props, sharedReadOnly: true });
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.onPagesPerRowChange, undefined, 'public shares retain their read-only density');
  assert.equal(videoSequence().scope, 'shared:owner:portal', 'Public browsing has its own sequence identity');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.creator.name, props.profile.name);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.creator.avatar, props.profile.avatar);
  tree = render(props);
  nodes(tree).find(node => node.type === Viewer).props.onPageFocusModeChange(true);
  tree = render(props);
  assert.equal(button(tree, 'Go back'), undefined, 'The project Back button must not overlap focused-page controls');
  assert.equal(button(tree, 'Portal preview'), undefined);
  nodes(tree).find(node => node.type === Viewer).props.onPageFocusModeChange(false);
  tree = render(props);
  button(tree, 'Go back').props.onClick();
  assert.equal(back, 1);
  nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onOpenIndex();
  tree = render(props);
  assert.equal(indexVisibility.at(-1), true, 'Opening the navigation tells the shared profile header to appear');
  assert.equal(button(tree, 'Go back'), undefined, 'The open project list already has Back to portals beside its title');
  const projectList = nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.index;
  const currentList = () => nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.index;
  const index = () => nodes(currentList()).find(node => node.type === Index).props;
  const toolbarProps = () => nodes(currentList()).find(node => node.type === MobilePortalProjectToolbar).props;
  assert.deepEqual(Array.from(index().projects, project => project.id), ['second', 'work']);
  assert.equal(index().mobileReorderDisabled, true, 'Recent sorting must not overwrite saved order');
  assert.equal(button(toolbar(projectList), 'Add a new project to Portal'), undefined, 'Visitors never receive authoring controls');
  assert.equal(nodes(toolbar(projectList)).some(node => node.props.type === 'range'), false);
  toolbarProps().onSort('title'); tree = render(props);
  assert.deepEqual(Array.from(index().projects, project => project.id), ['work', 'second']);
  assert.equal(index().mobileReorderDisabled, true);
  toolbarProps().onSort('saved'); tree = render(props);
  assert.deepEqual(Array.from(index().projects, project => project.id), ['work', 'second']);
  assert.equal(index().mobileReorderDisabled, false);
  assert.equal(nodes(toolbar(currentList())).find(node => node.props.type === 'search'), undefined);
  toolbarProps().onLayout('grid'); tree = render(props);
  assert.equal(index().mobileLayout, 'grid');
  assert.deepEqual(props.profile.projects.map(project => project.id), ['work', 'second'], 'Browsing sorts never mutate stored order');
  typographyRead = { savingProjectId: 'work' };
  tree = render({ ...props, viewerRole: 'owner' });
  assert.equal(toolbarProps().onCreate, props.onCreateProject, 'The owner receives the existing creation callback');
  assert.equal(typeof nodes(tree).find(node => node.type === Viewer).props.onPagesPerRowCommit, 'function');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.savingPageLayout, true, 'owner save state reaches the reader control');
  assert.equal(nodes(toolbar(currentList())).some(node => node.props.type === 'range'), false);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.creator.name, props.profile.name,
    'Permission changes must not change the displayed source creator');
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.savingPageLayout, false, 'another viewer is not blocked by the owner save state');
  typographyRead = {};
  nodes(projectList).find(node => node.type === Index).props.onSelect('second');
  render(props);
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.projectId, 'second');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.isIndexOpen, true);
  assert.equal(indexVisibility.at(-1), true, 'Choosing a project keeps the same navigation and profile context open');
  assert.equal(button(tree, 'Go back'), undefined, 'Selecting another project keeps the duplicate Back hidden');
  nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onCloseIndex();
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.isIndexOpen, false);
  assert.equal(indexVisibility.at(-1), false, 'Dismissing navigation restores the content-only presentation');
  assert.ok(button(tree, 'Go back'), 'Closing the list restores the content viewer Back button');
  assert.ok(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onOpenIndex);
  button(toolbar(projectList), 'Back to portals').props.onClick();
  assert.equal(button(projectList, 'Collapse document list'), undefined, 'The clean mobile header uses outside dismissal instead of a duplicate collapse control');
  assert.equal(portalReturns, 1);
  currentRoute = { kind: 'category', profileId: 'owner', categoryId: 'portal' };
  const beforeOpeningPortal = selections.length;
  tree = render({ ...props, activeProjectId: null });
  assert.equal(selections.length, beforeOpeningPortal, 'Opening a MOBILE portal must wait for a project choice');
  assert.ok(nodes(tree).find(node => node.type === IndexPortal));
  assert.equal(nodes(tree).find(node => node.type === Viewer), undefined);
  assert.deepEqual(Array.from(nodes(tree).find(node => node.type === Index).props.projects, project => project.id), ['work', 'second']);
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    for (const sharedReadOnly of [false, true]) {
      tree = render({ ...props, activeProjectId: null, viewerRole, sharedReadOnly,
        profile: { ...props.profile, projects: props.profile.projects.slice(0, 1) } });
      assert.ok(nodes(tree).find(node => node.type === IndexPortal), 'Even one-project portals open the chooser');
      assert.equal(nodes(tree).find(node => node.type === Viewer), undefined);
      assert.equal(selections.length, beforeOpeningPortal);
    }
  }
  tree = render({ ...props, activeProjectId: null });
  nodes(tree).find(node => node.type === Index).props.onSelect('second');
  assert.deepEqual(selections.at(-1), ['second', undefined], 'Only the chosen row opens a project');
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.projectId, 'second');
  tree = render({ ...props, activeProjectId: null });
  button(toolbar(tree), 'Back to portals').props.onClick();
  assert.equal(portalReturns, 2);
  assert.equal(back, 1);
  props.activeProjectId = 'work';
  currentRoute = { kind: 'project', profileId: 'owner', categoryId: 'portal', projectId: 'work' };
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.projectId, 'work');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.isIndexOpen, false, 'An explicit project link does not force the index open');
  const selectionCount = selections.length;
  for (const route of [
    { kind: 'profile', profileId: 'owner' },
    { kind: 'portals' },
    { kind: 'category', profileId: 'owner', categoryId: 'another-portal' },
    { kind: 'category', profileId: 'another-owner', categoryId: 'portal' },
  ]) {
    currentRoute = route;
    render({ ...props, activeProjectId: null });
    assert.equal(selections.length, selectionCount, 'An outgoing category snapshot must not redirect the live screen');
  }
  currentRoute = { kind: 'category', profileId: 'owner', categoryId: 'portal' };
  tree = render({ ...props, activeProjectId: null, profile: { ...props.profile, projects: [] } });
  assert.equal(selections.length, selectionCount);
  assert.ok(button(toolbar(tree), 'Back to portals'));
  assert.ok(nodes(tree).find(node => node.type === IndexPortal), 'Empty portals use the same floating frame');
  button(tree, 'Close project list').props.onClick();
  assert.equal(portalReturns, 3);
  tree = render({ ...props, sharedReadOnly: true, activeProjectId: null, profile: { ...props.profile, projects: [] } });
  assert.ok(nodes(tree).find(node => node.type === IndexPortal), 'Public empty portals also use the floating frame');
  assert.equal(withProp(tree, 'data-project-index-panel').props['data-collapsed'], false);
  let retried = 0;
  arrangementRead = { loadError: 'Connection unavailable', reload: () => retried++ };
  tree = render({ ...props, sharedReadOnly: true, activeProjectId: null, profile: { ...props.profile, projects: [] } });
  const failedIndex = nodes(tree).find(node => node.type === IndexPortal);
  nodes(failedIndex).find(node => node.props.title === 'Projects could not be loaded').props.onRetry();
  assert.equal(retried, 1, 'Public portal retry stays inside the floating popup');
  assert.equal(nodes(tree).find(node => node.props['aria-label'] === 'Loading project'), undefined);
  arrangementRead = { isLoading: true };
  tree = render({ ...props, sharedReadOnly: true, activeProjectId: null, profile: { ...props.profile, projects: [] } });
  assert.ok(nodes(nodes(tree).find(node => node.type === IndexPortal)).find(node => node.props.label === 'Loading projects…'));
  arrangementRead = {};
  tree = render({ ...props, activeProjectId: 'missing' });
  assert.equal(selections.length, selectionCount);
  assert.equal(tree.props['data-mobile-project-view'], undefined);
  assert.equal(withProp(tree, 'data-project-index-panel').props.style.width, '52px');
  assert.ok(nodes(tree).find(node => node.props['aria-label'] === 'Project not found'));
  nodes(projectList).find(node => node.type === MobilePortalProjectToolbar).props.onSort('recent');
  presentation = 'web'; workspaceWidth = 1200;
  tree = render({ ...props, isIndexCollapsed: false });
  assert.ok(withProp(tree, 'data-project-index-panel'));
  assert.equal(nodes(tree).find(node => node.type === IndexPortal), undefined, 'WEB retains its inline index');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation, undefined);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.videoSequence, undefined, 'WEB does not receive a video sequence');
  assert.equal(button(tree, 'Go back'), undefined);
  assert.equal(button(tree, 'Back to portals'), undefined);
  assert.equal(toolbar(tree), undefined, 'WEB keeps its existing toolbar');
  const webIndex = nodes(tree).find(node => node.type === Index).props;
  assert.deepEqual(Array.from(webIndex.projects, project => project.id), ['work', 'second']);
  assert.equal(webIndex.mobileReorderFromMenu, false);
  assert.equal(webIndex.mobileReorderDisabled, false);
  const webProps = { ...props, isIndexCollapsed: false };
  const slider = () => nodes(tree).find(node => node.type === PageDensity);
  const viewer = () => nodes(tree).find(node => node.type === Viewer);
  typographyRead = { savingProjectId: 'work', setPagesPerRow: () => assert.fail('A viewer cannot save the creator layout') };
  tree = render(webProps);
  assert.equal(slider().props.value, 3);
  assert.equal(slider().props.onCommit, undefined);
  assert.equal(slider().props.saving, false);
  slider().props.onChange(5);
  tree = render(webProps);
  assert.equal(slider().props.value, 5);
  assert.equal(viewer().props.pagesPerRow, 5);
  assert.equal(viewer().props.onPagesPerRowCommit, undefined);

  tree = render({ ...webProps, viewerRole: 'owner' });
  assert.equal(typeof slider().props.onCommit, 'function');
  assert.equal(slider().props.saving, true);
  tree = render({ ...webProps, sharedReadOnly: true });
  assert.equal(slider(), undefined, 'The public reader owns its own slider');
  typographyRead = {};
  tree = render({ ...webProps, profile: { ...props.profile, projects: [
    { ...props.profile.projects[0], pageCount: 1 }, props.profile.projects[1],
  ] } });
  assert.equal(slider(), undefined, 'Single-page work has no row density control');

  currentRoute = { kind: 'category', profileId: 'owner', categoryId: 'portal' };
  tree = render({ ...props, activeProjectId: null, isIndexCollapsed: false });
  assert.deepEqual(selections.at(-1), ['work', true], 'WEB retains its saved-order first-project selection');
  assert.equal(selections.length, selectionCount + 1);
  currentRoute = { kind: 'project', profileId: 'owner', categoryId: 'portal', projectId: 'work' };
  tree = render({ ...props, isIndexCollapsed: false });
  tree = render({ ...props, isIndexCollapsed: false, readerLoading: true });
  assert.ok(withProp(tree, 'data-project-index-panel'), 'Uncached WEB media keeps its project index mounted');
  assert.ok(withProp(tree, 'data-project-reader-loading'));
  assert.equal(withProp(tree, 'data-project-reader-loading').props.role, 'status');
  assert.ok(nodes(withProp(tree, 'data-project-reader-loading')).some(node => node.props.className === 'premium-media-loading-mark'), 'Only the existing system loading glyph appears inside the pending reader');
  assert.equal(nodes(tree).find(node => node.type === Viewer), undefined, 'Pending WEB media never shows a previous project');
  presentation = 'mobile';
  tree = render({ ...props, isIndexCollapsed: false, readerLoading: true });
  assert.equal(withProp(tree, 'data-project-reader-loading'), undefined, 'The WEB pending-reader contract cannot change MOBILE');
  assert.ok(nodes(tree).find(node => node.type === Viewer));
  presentation = 'web';
  tree = render({ ...props, isIndexCollapsed: false });
  assert.ok(nodes(tree).find(node => node.type === Viewer), 'Resolved WEB media returns in the existing workspace');
  // A WEB query must never become an invisible MOBILE filter after resizing.
  for (const query of ['needle', 'no-matching-project']) {
    const search = nodes(tree).find(node => node.props.type === 'search');
    search.props.onChange({ target: { value: query } });
    tree = render({ ...props, isIndexCollapsed: false });
    const expected = query === 'needle' ? ['second'] : [];
    assert.deepEqual(Array.from(nodes(tree).find(node => node.type === Index).props.projects, project => project.id), expected);
    presentation = 'mobile'; workspaceWidth = 390;
    tree = render(props);
    nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onOpenIndex();
    tree = render(props);
    toolbarProps().onSort('saved'); tree = render(props);
    assert.deepEqual(Array.from(index().projects, project => project.id), ['work', 'second']);
    assert.equal(index().mobileReorderDisabled, false);
    assert.equal(nodes(tree).find(node => node.props.type === 'search'), undefined);
    assert.equal(nodes(tree).find(node => node.type === 'p' && React.Children.toArray(node.props.children).some(child => typeof child === 'string' && child.includes('matches'))), undefined);
    presentation = 'web'; workspaceWidth = 1200;
    tree = render({ ...props, isIndexCollapsed: false });
    assert.equal(nodes(tree).find(node => node.props.type === 'search').props.value, query);
    assert.deepEqual(Array.from(nodes(tree).find(node => node.type === Index).props.projects, project => project.id), expected);
  }
});

test('direct public-project Back remains public; existing browser history takes priority', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const fn = source.match(/function returnFromPortal\(\) \{[\s\S]*?\n  \}/)[0];
  for (const idx of [0, 2]) {
    const calls = [];
    const back = vm.runInNewContext(`(${fn})`, { window: { history: { state: { idx } } },
      isSharedRoute: true, viewedProfileId: 'creator', isOwnerMode: false,
      nav: { back: () => calls.push('back'), to: (...args) => calls.push(args) },
      buildPath: (kind, values) => `${kind}/${values?.profileId ?? ''}` });
    back();
    assert.deepEqual(calls, idx === 2 ? ['back'] : [['sharedProfile/creator', true]]);
  }
});


test('Back to portals targets the viewed creator collection rather than previous projects', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const fn = source.match(/function returnToPortalCollection\(\) \{[\s\S]*?\n  \}/)[0];
  for (const [isSharedRoute, isOwnerMode, expected] of [
    [false, true, 'portals/'], [false, false, 'profile/creator?view=portals'], [true, false, 'sharedProfile/creator'],
  ]) {
    const calls = [];
    const go = vm.runInNewContext(`(${fn})`, { presentation: 'mobile', activeCategoryId: 'art', returnToMobilePortalCollection: () => false,
      isSharedRoute, isOwnerMode, viewedProfileId: 'creator',
      nav: { to: (...args) => calls.push(args), back: () => assert.fail('Must not revisit a project') },
      buildPath: (kind, values) => `${kind}/${values?.profileId ?? ''}` });
    go();
    assert.deepEqual(calls, [[expected, true]]);
  }
});


test('public mobile image progress follows the image page context and preserves platform and WEB presentation', () => {
  const counter = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
  const media = tree => nodes(tree).find(node => node.type === AttachmentRenderer);
  const shared = harness({ mediaKind: 'image', readOnlyShare: true });
  let tree = shared.render();
  assert.equal(counter(tree).props.readingMode, false);
  assert.equal(counter(tree).props.showProgress, true);
  assert.equal(counter(tree).props.segmentedProgress, false);
  assert.equal(counter(tree).props.onSelectPage, undefined, 'image previews keep their existing scroll handler');
  for (const current of [1, 2, 1]) {
    counter(tree).props.onPositionChange({ scope: counter(tree).props.scope, current, total: 2 });
    tree = shared.render();
    const context = nodes(tree).find(node => node.type === 'mobile-page-context').props.value;
    assert.equal(context.attachmentId, shared.attachments[current - 1].id);
    assert.equal(context.pageIndex, current - 1);
  }
  media(tree).props.onFocusModeChange(true);
  assert.equal(counter(shared.render()).props.showProgress, false);
  media(tree).props.onFocusModeChange(false);
  assert.equal(counter(shared.render()).props.showProgress, true);
  assert.equal(counter(harness({ mediaKind: 'image' }).render()).props.showProgress, false, 'platform image controls retain their existing presentation');
  assert.equal(counter(harness({ mediaKind: 'image', mobile: false, readOnlyShare: true }).render()), undefined);
  for (const mediaKind of ['video', 'audio']) assert.equal(counter(harness({ mediaKind, readOnlyShare: true }).render())?.props.readingMode ?? false, false);
});


test('mobile content bar retains portal, information and creator navigation for ordinary and shared readers', () => {
  for (const readOnlyShare of [false, true]) for (const signedIn of [true, false]) {
    const h = harness({readOnlyShare,signedIn});
    const tree = h.render({creator:{id:'creator-id',name:'Creator',avatar:''}});
    const bar = nodes(tree).find(node => node.props.className === 'mobile-content-action-bar');
    const controls = React.Children.toArray(bar.props.children);
    assert.equal(controls[0].props['aria-label'], 'Open portal');
    assert.equal(controls.length, 3);
    assert.equal(controls[1].props['aria-label'], readOnlyShare ? 'Show project information' : 'Show project engagement');
    assert.equal(controls[1].props.children.props.className, 'reader-info-glyph');
    assert.equal(controls[1].props.children.props.children, 'i');
    assert.equal(controls[1].props.children.props['aria-hidden'], 'true');
    assert.equal(controls[2].props['aria-label'], 'View Creator profile');
    controls[0].props.onClick();
    assert.equal(withProp(h.render(), 'data-mobile-combined-rail').props['data-mobile-combined-rail'], '');
    controls[2].props.onClick();
    assert.equal(h.navigationCalls.at(-1), `${readOnlyShare ? 'sharedProfile' : 'profile'}:creator-id`);
  }
});

test('mobile reader restores density independently for each project and document', () => {
  const h = harness({ mediaKind: 'document' });
  h.viewerMemory.set('workspace:project:project:density:first', { pagesPerRow: 4 });
  h.viewerMemory.set('workspace:project:other:density:first', { pagesPerRow: 2 });
  const counter = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
  const render = overrides => h.render({ onPagesPerRowChange() {}, ...overrides });
  assert.equal(counter(render()).props.density.value, 4);
  counter(render()).props.density.onChange(3);
  assert.equal(h.viewerMemory.get('workspace:project:project:density:first').pagesPerRow, 3);
  assert.equal(counter(render({ projectId: 'other' })).props.density.value, 2);
  assert.equal(counter(render()).props.density.value, 3);
});

test('project information opens directly and dismissal preserves the selected attachment without an options handoff', () => {
 const h=harness();
 button(h.render(),'second, Video').props.onClick();
 button(h.render(),'Show project description').props.onClick();
 nodes(h.render()).find(node=>node.type===FollowContentInfoPopup).props.onClose();
 assert.equal(h.optionCalls.length,0);
 assert.equal(nodes(h.render()).some(node=>node.type===FollowContentInfoPopup),false);
 h.screenActions.at(-1).onOpen();
 const info=nodes(h.render()).find(node=>node.type===FollowContentInfoPopup);
 assert.ok(info);assert.equal(info.props.onOptions,undefined,'The information card cannot open the retired generic options screen');
 info.props.onClose();
 const tree=h.render();
 assert.equal(nodes(tree).some(node=>node.type===FollowContentInfoPopup),false);
 assert.equal(h.optionCalls.length,0);
 assert.equal(nodes(tree).find(node=>node.type===AttachmentRenderer).props.attachment.id,'second');
});

test('owner and visitor readers retain bottom portal, information and creator controls', () => {
 const h=harness({mediaKind:'image'});
 const props={isOwner:true,creator:{id:'creator-id',name:'Creator',avatar:''}};
 let tree=h.render(props);
 const controls=nodes(tree).find(n=>n.props.className==='mobile-content-action-bar'); assert.ok(controls); assert.equal(nodes(controls).filter(n=>n.type==='button').length,3);
 const screen=h.screenActions.at(-1); assert.equal(typeof screen.onOpen,'function');
 const actions=[...screen.model.primary,...screen.model.groups.flat()];
 for(const id of ['list','projectInfo','viewProfile'])assert.ok(actions.some(a=>a.id===id));
 actions.find(a=>a.id==='list').run();assert.ok(withProp(h.render(props),'data-project-index-panel'));
 const info=harness({mediaKind:'image'});info.render(props);info.screenActions.at(-1).model.groups.flat().find(a=>a.id==='projectInfo').run();
 assert.ok(nodes(info.render(props)).some(n=>n.type===FollowContentInfoPopup));
 actions.find(a=>a.id==='viewProfile').run();assert.equal(h.navigationCalls.at(-1),'profile:creator-id');
 const visitor=harness({mediaKind:'image',readOnlyShare:true});const publicTree=visitor.render(props);
 assert.ok(nodes(publicTree).some(n=>n.props.className==='mobile-content-action-bar'));
 assert.equal(typeof visitor.screenActions.at(-1).onOpen,'function');
});

test('owner information offers only Edit project and Delete project through the existing editor and confirmation',()=>{
 for(const command of ['edit','delete']){
  const calls=[],h=harness({mediaKind:'image'}),props={isOwner:true,creator:{id:'creator-id',name:'Creator',avatar:''},
   descriptionEditor:{open:id=>calls.push(['edit',id])},onDeleteProject:()=>calls.push(['delete'])};
  h.render(props);h.screenActions.at(-1).onOpen();
  const info=nodes(h.render(props)).find(node=>node.type===FollowContentInfoPopup);
  assert.ok(info);assert.equal(info.props.onOptions,undefined);
  assert.equal(info.props.optionsContent.type,ProjectPopupOwnerActions);
  const controls=info.props.optionsContent.props;
  assert.equal(controls.onOptions,undefined);
  const buttons=nodes(ProjectPopupOwnerActions(controls)).filter(node=>node.type==='button');
  assert.deepEqual(buttons.map(node=>node.props.children),['Edit project','Delete project']);
  assert.equal(buttons[0].props['data-destructive'],undefined);assert.equal(buttons[1].props['data-destructive'],true);
  const label=command==='edit'?'Edit project':'Delete project';
  buttons.find(node=>node.props.children===label).props.onClick();
  assert.deepEqual(calls,command==='edit'?[['edit','project']]:[['delete']]);
  assert.equal(nodes(h.render(props)).some(node=>node.type===FollowContentInfoPopup),false);
  assert.equal(h.optionCalls.length,0);
 }
 const visitor=harness({readOnlyShare:true,mediaKind:'image'});
 visitor.render({isOwner:false,descriptionEditor:{open(){assert.fail('Visitor cannot edit');}},onDeleteProject(){assert.fail('Visitor cannot delete');}});
 visitor.screenActions.at(-1).onOpen();
 const popup=nodes(visitor.render()).find(node=>node.type===FollowContentInfoPopup);
 assert.equal(popup.props.onOptions,undefined);assert.equal(popup.props.optionsContent,undefined);
});
