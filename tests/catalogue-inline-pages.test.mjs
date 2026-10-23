import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const navigation = sourceModule('src/presentation/mobile/useNavigationSwipe.ts');
const position = sourceModule('src/features/profile/cataloguePagePosition.ts');
const model = sourceModule('src/components/profile/inlineProjectPageModel.ts', {
  '../../presentation/mobile/useNavigationSwipe': navigation, '../../features/profile/cataloguePagePosition': position,
});
const plain = value => JSON.parse(JSON.stringify(value));
const file = (id, kind, order, metadata = {}) => ({ id, kind, order, metadata, displayName: id, sourceUrl: `/${id}`, status: 'ready' });

test('slides use the existing cover then real ordered attachments and real PDF pages without mutating input', () => {
  const image = file('image', 'image', 0), video = file('video', 'video', 2), pdf = file('pdf', 'document', 1, { pageCount: 3 });
  const attachments = [video, pdf, image];
  const slides = model.inlineProjectSlides({ attachments });
  assert.deepEqual(plain(slides.map(({ index, key, attachmentId, page }) => ({ index, key, attachmentId, page }))), [
    { index: 0, key: 'cover' }, { index: 1, key: 'image:image', attachmentId: 'image', page: 1 },
    { index: 2, key: 'pdf:page:1', attachmentId: 'pdf', page: 1 }, { index: 3, key: 'pdf:page:2', attachmentId: 'pdf', page: 2 },
    { index: 4, key: 'pdf:page:3', attachmentId: 'pdf', page: 3 }, { index: 5, key: 'video:media', attachmentId: 'video' },
  ]);
  assert.deepEqual(attachments.map(item => item.id), ['video', 'pdf', 'image']);
  assert.equal(slides[1].attachment, image);
  assert.deepEqual(plain(model.inlineProjectSlides({})), [{ index: 0, key: 'cover' }]);
  assert.deepEqual(plain(model.inlineProjectSlides({ attachments: [] })), [{ index: 0, key: 'cover' }]);
});

test('document totals use verified metadata or the actual PDF catalog; raster indexes retain document order', () => {
  const pdf = file('doc', 'document', 0, { renderedPages: [{ attachmentId: 'other', withinDocumentIndex: 900 }, { attachmentId: 'doc', withinDocumentIndex: 3 }, { attachmentId: 'doc', withinDocumentIndex: 1 }] });
  assert.equal(model.inlineDocumentCount(pdf), 3);
  assert.deepEqual(plain(model.inlineProjectSlides({ attachments: [pdf] }).map(slide => slide.key)), ['cover', 'doc:page:1', 'doc:page:2', 'doc:page:3']);
  const key = model.inlineDocumentCountKey(pdf);
  assert.equal(model.inlineProjectSlides({ attachments: [pdf] }, { [key]: 2 }).length, 3);
  const unknown = file('unknown', 'document', 0);
  assert.equal(model.inlineDocumentCount(unknown), undefined);
  assert.equal(model.inlineDocumentCount(unknown, -2), undefined);
  assert.notEqual(model.inlineDocumentCountKey(unknown), model.inlineDocumentCountKey({ ...unknown, sourceUrl: '/replacement' }));
});

test('image reading targets count images independently of PDFs and other media', () => {
  const slides = model.inlineProjectSlides({ attachments: [file('image2', 'image', 3), file('audio', 'audio', 2), file('image1', 'image', 0), file('pdf', 'document', 1, { pageCount: 2 })] });
  assert.equal(slides.find(slide => slide.attachmentId === 'image2').page, 2);
  assert.equal(slides.find(slide => slide.attachmentId === 'audio').page, undefined);
  assert.equal(model.inlinePositionMatches({ index: 5, key: 'image2:image', attachmentId: 'image2', page: 1 }, slides.at(-1)), false);
});

test('authoritative cover attachment identity removes only the first matching image and retains original reader ordinals', () => {
  const first = file('first', 'image', 0), second = file('second', 'image', 1);
  const attachments = [second, first], original = JSON.stringify(attachments);
  const project = { cover: '/pre-rendered-thumbnail.webp', coverThumbnail: { sourceAttachmentId: 'first' }, attachments };
  assert.deepEqual(plain(model.inlineProjectSlides(project).map(({ index, key, attachmentId, page }) => ({ index, key, attachmentId, page }))), [
    { index: 0, key: 'cover' }, { index: 1, key: 'second:image', attachmentId: 'second', page: 2 },
  ]);
  assert.equal(JSON.stringify(attachments), original, 'Cover de-duplication never mutates attachment data or authored ordering.');
  const conflicting = { ...project, cover: first.sourceUrl, coverThumbnail: { sourceAttachmentId: 'second' } };
  assert.deepEqual(plain(model.inlineProjectSlides(conflicting).map(slide => slide.key)), ['cover', 'first:image', 'second:image'],
    'The displayed thumbnail source is authoritative over a stale project.cover URL.');
  assert.deepEqual(plain(model.inlineProjectSlides({ ...project, attachments: [{ ...first, sourceUrl: null }] }).map(slide => slide.key)), ['cover'],
    'Stable cover provenance remains valid when an original has no current delivery URL.');
});

test('canonical signed storage references tolerate token rotation but retain meaningful source differences', () => {
  const base = 'https://storage.example.invalid/storage/v1/object/sign/project-media/profile/project/first.webp';
  const first = { ...file('first', 'image', 0), sourceUrl: `${base}?token=new&download=original` };
  const keys = cover => plain(model.inlineProjectSlides({ cover, attachments: [first, file('second', 'image', 1)] }).map(slide => slide.key));
  assert.deepEqual(keys(`${base}?token=old&download=original`), ['cover', 'second:image']);
  for (const cover of [
    `${base}?token=old&download=different`,
    `${base.replace('storage.example.invalid', 'other.example.invalid')}?token=old&download=original`,
    `${base.replace('first.webp', 'different.webp')}?token=old&download=original`,
  ]) assert.deepEqual(keys(cover), ['cover', 'first:image', 'second:image']);
  for (const [cover, sourceUrl] of [
    ['https://images.example.invalid/render?asset=first', 'https://images.example.invalid/render?asset=other'],
    ['https://images.example.invalid/first.webp?token=old', 'https://images.example.invalid/first.webp?token=new'],
    ['/first.webp#first-view', '/first.webp#other-view'],
  ]) assert.deepEqual(plain(model.inlineProjectSlides({ cover, attachments: [{ ...first, sourceUrl }] }).map(slide => slide.key)), ['cover', 'first:image']);
});

test('separate covers, unproven cover flags and later intentional asset reuse remain content', () => {
  const first = { ...file('first', 'image', 0), sourceUrl: '/cover.webp', isCover: true };
  const later = { ...file('later', 'image', 2), sourceUrl: first.sourceUrl };
  const second = file('second', 'image', 1);
  assert.deepEqual(plain(model.inlineProjectSlides({ cover: first.sourceUrl, attachments: [first, second, later] }).map(slide => slide.key)),
    ['cover', 'second:image', 'later:image'], 'Only the first content entry is removed; later reuse is authored content.');
  assert.deepEqual(plain(model.inlineProjectSlides({ cover: '/different-cover.webp', attachments: [first, second] }).map(slide => slide.key)),
    ['cover', 'first:image', 'second:image'], 'isCover alone cannot override a distinct displayed cover.');
  assert.deepEqual(plain(model.inlineProjectSlides({ cover: second.sourceUrl, attachments: [first, second] }).map(slide => slide.key)),
    ['cover', 'first:image', 'second:image'], 'A later cover asset is not silently removed from the project sequence.');
});

test('PDF cover identity includes the chosen page and removes only a matching first document page', () => {
  const doc = file('doc', 'document', 0, { pageCount: 3, coverPageNumber: 2 });
  const project = { cover: '/thumbnail.webp', coverThumbnail: { sourceAttachmentId: 'doc' }, coverKind: 'document', attachments: [doc] };
  const keys = value => plain(model.inlineProjectSlides(value).map(slide => slide.key));
  assert.deepEqual(keys({ ...project, coverPageNumber: 1 }), ['cover', 'doc:page:2', 'doc:page:3']);
  assert.deepEqual(keys({ ...project, coverPageNumber: 2 }), ['cover', 'doc:page:1', 'doc:page:2', 'doc:page:3']);
  assert.deepEqual(keys(project), ['cover', 'doc:page:1', 'doc:page:2', 'doc:page:3'], 'Attachment cover-page metadata is used when the project has no explicit page.');
  const defaultDoc = file('doc', 'document', 0, { pageCount: 3 });
  assert.deepEqual(keys({ ...project, attachments: [defaultDoc] }), ['cover', 'doc:page:2', 'doc:page:3']);
  assert.deepEqual(plain(model.inlineProjectSlides({ ...project, coverPageNumber: 1 }).slice(1).map(({ index, page }) => ({ index, page }))),
    [{ index: 1, page: 2 }, { index: 2, page: 3 }]);
  const unknown = file('unknown', 'document', 0);
  const resolved = model.inlineProjectSlides({ cover: unknown.sourceUrl, coverKind: 'document', attachments: [unknown] }, { [model.inlineDocumentCountKey(unknown)]: 3 });
  assert.deepEqual(plain(resolved.map(slide => slide.key)), ['cover', 'unknown:page:2', 'unknown:page:3'],
    'Resolving the real PDF catalog count cannot reintroduce its duplicate cover page.');
});

test('a rasterized PDF cover matches only its actual first page provenance', () => {
  const doc = file('doc', 'document', 0, { pageCount: 2, renderedPages: [
    { attachmentId: 'doc', withinDocumentIndex: 1, sourceUrl: '/rendered-first.webp', storagePath: 'profile/project/page-1.webp' },
    { attachmentId: 'doc', withinDocumentIndex: 2, sourceUrl: '/rendered-second.webp', storagePath: 'profile/project/page-2.webp' },
  ] });
  const keys = (cover, attachments = [doc]) => plain(model.inlineProjectSlides({ cover, attachments }).map(slide => slide.key));
  assert.deepEqual(keys('/rendered-first.webp'), ['cover', 'doc:page:2']);
  assert.deepEqual(keys('/rendered-second.webp'), ['cover', 'doc:page:1', 'doc:page:2']);
  const foreign = { ...doc, metadata: { ...doc.metadata, renderedPages: [{ attachmentId: 'other-document', withinDocumentIndex: 1, sourceUrl: '/rendered-first.webp' }] } };
  assert.deepEqual(keys('/rendered-first.webp', [foreign]), ['cover', 'doc:page:1', 'doc:page:2']);
});

test('matching video cover assets are not duplicated while audio and unsupported cover kinds retain their content controls', () => {
  const video = file('video', 'video', 0);
  assert.deepEqual(plain(model.inlineProjectSlides({ cover: video.sourceUrl, coverKind: 'video', attachments: [video] }).map(slide => slide.key)), ['cover']);
  const audio = file('audio', 'audio', 0);
  assert.deepEqual(plain(model.inlineProjectSlides({ cover: audio.sourceUrl, attachments: [audio] }).map(slide => slide.key)), ['cover', 'audio:media']);
  const unsupported = file('interactive', 'interactive', 0);
  assert.deepEqual(plain(model.inlineProjectSlides({ cover: unsupported.sourceUrl, attachments: [unsupported] }).map(slide => slide.key)), ['cover', 'interactive:media']);
});

test('remembered duplicate positions resolve to the cover while later content retains attachment and true reading page', () => {
  const first = file('first', 'image', 0), second = file('second', 'image', 1), repeat = { ...file('repeat', 'image', 2), sourceUrl: first.sourceUrl };
  const project = { cover: first.sourceUrl, attachments: [first, second, repeat] };
  const omitted = { index: 1, key: 'first:image', attachmentId: 'first', page: 1 };
  assert.deepEqual(plain(model.normalizeInlineProjectPosition(project, omitted, true)), { index: 0, key: 'cover' });
  assert.equal(model.normalizeInlineProjectPosition(project, omitted, false), omitted, 'Incomplete loads cannot erase a remembered position.');
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ ...project, attachments: [first, file('unknown', 'document', 1)] }, omitted, true)),
    { index: 0, key: 'cover' }, 'An unresolved later document must not preserve a known removed duplicate key.');
  assert.deepEqual(plain(model.normalizeInlineProjectPosition(project, { index: 2, key: 'second:image', attachmentId: 'second', page: 2 }, true)),
    { index: 1, key: 'second:image', attachmentId: 'second', page: 2 });
  assert.deepEqual(plain(model.normalizeInlineProjectPosition(project, { index: 3, key: 'repeat:image', attachmentId: 'repeat', page: 3 }, true)),
    { index: 2, key: 'repeat:image', attachmentId: 'repeat', page: 3 });
  const pdf = file('doc', 'document', 0, { pageCount: 3 });
  const pdfProject = { cover: pdf.sourceUrl, coverKind: 'document', coverPageNumber: 1, attachments: [pdf] };
  assert.deepEqual(plain(model.normalizeInlineProjectPosition(pdfProject, { index: 1, key: 'doc:page:1', attachmentId: 'doc', page: 1 }, true)), { index: 0, key: 'cover' });
  assert.deepEqual(plain(model.normalizeInlineProjectPosition(pdfProject, { index: 2, key: 'doc:page:2', attachmentId: 'doc', page: 2 }, true)),
    { index: 1, key: 'doc:page:2', attachmentId: 'doc', page: 2 });
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ ...pdfProject, coverPageNumber: 2 }, { index: 1, key: 'doc:page:1', attachmentId: 'doc', page: 1 }, true)),
    { index: 1, key: 'doc:page:1', attachmentId: 'doc', page: 1 });
});

test('dense-grid targets normalize removals, changed PDF totals and image ordering without erasing incomplete loads', () => {
  const remembered = { index: 9, key: 'doc:page:9', attachmentId: 'doc', page: 9 };
  assert.equal(model.normalizeInlineProjectPosition({}, remembered), remembered);
  assert.equal(model.normalizeInlineProjectPosition({ attachments: [] }, remembered), remembered);
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ attachments: [] }, remembered, true)), { index: 0, key: 'cover' });
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ attachments: [file('doc', 'document', 0, { pageCount: 3 })] }, remembered, true)), { index: 3, key: 'doc:page:3', attachmentId: 'doc', page: 3 });
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ attachments: [file('other', 'image', 0)] }, remembered, true)), { index: 0, key: 'cover' });
  const unknown = file('pending', 'document', 0), image = file('image', 'image', 1);
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ attachments: [unknown, image] }, { index: 22, key: 'image:image', attachmentId: 'image', page: 7 }, true)), { index: 22, key: 'image:image', attachmentId: 'image', page: 1 });
  assert.deepEqual(plain(model.normalizeInlineProjectPosition({ attachments: [file('doc', 'document', 0)] }, remembered, true)), remembered);
  const positionAfterReorder = model.normalizeInlineProjectPosition({ attachments: [file('first', 'image', 2), file('second', 'image', 0)] }, { index: 2, key: 'second:image', attachmentId: 'second', page: 2 }, true);
  assert.deepEqual(plain(positionAfterReorder), { index: 1, key: 'second:image', attachmentId: 'second', page: 1 });
});

test('long projects use a compact moving dot window with a separate project-menu target', () => {
  assert.deepEqual(plain(model.inlineDotWindow(100, 200, 5)), [98, 99, 100, 101, 102]);
  assert.deepEqual(plain(model.inlineDotWindow(0, 200, 5)), [0, 1, 2, 3, 4]);
  assert.deepEqual(plain(model.inlineDotWindow(199, 200, 5)), [195, 196, 197, 198, 199]);
  assert.deepEqual(plain(model.inlineDotWindow(0, 1, 5)), [0]);
  for (const width of [288, 320, 388, 600]) assert.equal(model.inlineDotLimit(width), 5);
  for (const width of [120, 164, 187]) assert.equal(model.inlineDotLimit(width), 0);
  assert.equal(model.inlineDotLimit(188), 3); assert.equal(model.inlineDotLimit(207), 5);
  for (const width of [188, 199, 206, 207, 288, 320, 388, 600]) {
    const count = model.inlineDotLimit(width);
    const controlWidth = Math.max(44, count * 5 + Math.max(0, count - 1) * 6 + 14);
    assert.ok(count === 1 || count === 3 || count === 5);
    assert.ok(controlWidth + 144 <= width, `${width}px card keeps the compact control clear of its menu target`);
  }
  assert.equal(model.inlineDotLimit(288), 5);
  assert.equal(model.inlineDotLimit(388), 5);
});

test('horizontal intent is deliberate; vertical and incomplete swipes keep the same project page', () => {
  const start = { x: 250, y: 100, time: 0 };
  assert.equal(model.inlineGestureAxis(8, 0), 'pending');
  assert.equal(model.inlineGestureAxis(20, 4), 'x');
  assert.equal(model.inlineGestureAxis(10, 10), 'y');
  for (const end of [{ x: 240, y: 100, time: 20 }, { x: 210, y: 101, time: 400 }, { x: 160, y: 250, time: 80 }]) assert.equal(model.inlineSwipePage(start, end, 3, 8), 3);
  assert.equal(model.inlineSwipePage(start, { x: 210, y: 101, time: 60 }, 3, 8), 4);
  assert.equal(model.inlineSwipePage(start, { x: 320, y: 101, time: 300 }, 3, 8), 2);
  assert.equal(model.inlineSwipePage(start, { x: 150, y: 101, time: 100 }, 7, 8), 7);
  assert.equal(model.inlineSwipePage(start, { x: 350, y: 101, time: 100 }, 0, 8), 0);
  assert.equal(model.inlineDragOffset(500, 0, 8, 350), 24);
  assert.equal(model.inlineDragOffset(-500, 7, 8, 350), -24);
  assert.equal(model.inlineDragOffset(-500, 3, 8, 350), -350);
});

test('keyboard page selection stays bounded and never becomes cross-project navigation', () => {
  assert.equal(model.inlineKeyboardPage('ArrowLeft', 0, 5), 0);
  assert.equal(model.inlineKeyboardPage('ArrowRight', 4, 5), 4);
  assert.equal(model.inlineKeyboardPage('Home', 3, 5), 0);
  assert.equal(model.inlineKeyboardPage('End', 0, 5), 4);
  assert.equal(model.inlineKeyboardPage('ArrowDown', 2, 5), null);
  assert.equal(model.inlineKeyboardPage('Enter', 2, 5), null);
});

function inlineRendererFixture({ active = true, width = 388, attachments, selected = 1, metadataComplete = true, projectFields = {} } = {}) {
  const react = { ...React, useEffect() {}, useMemo: read => read(), useCallback: fn => fn,
    useRef: initial => ({ current: initial }), useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
  const noop = () => null;
  const swipes = [];
  const renderer = sourceModule('src/components/profile/InlineProjectPages.tsx', {
    react, 'react-router-dom': { Link: noop },
    '../../features/profile/cataloguePagePosition': position,
    '../../hooks/useElementSize': { useElementSize: () => ({ ref: { current: null }, width, height: 388 }) },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    '../media/ImageAttachment': { ImagePage: noop }, '../media/AttachmentRenderer': { AttachmentRenderer: noop },
    '../ui/StateViews': { ErrorState: noop },
    '../../utils/projectContinuity': { getProjectContinuityArtwork: () => undefined, projectContinuityStyle: () => ({}) },
    './inlineProjectPageModel': model,
    './useInlineProjectSwipe': { useInlineProjectSwipe: (enabled, selected, total) => { swipes.push({ enabled, selected, total }); return { offset: 0, dragging: false, handlers: {} }; } },
    './inline-project-pages.css': {},
  });
  const project = { id: 'project', title: 'Project', attachments: attachments ?? [file('a', 'image', 0), file('b', 'image', 1), file('c', 'image', 2)], ...projectFields };
  const slide = model.inlineProjectSlides(project)[selected];
  const calls = [], opened = [];
  const tree = renderer.InlineProjectPages({ project, active, metadataComplete, cover: 'cover', position: slide,
    onSelect(value) { calls.push(value); }, onOpen(event) { opened.push(event); }, label: 'Open Project' });
  const nodes = [];
  const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (!React.isValidElement(node)) return;
    nodes.push(node); walk(node.props.children); };
  walk(tree);
  return { tree, nodes, calls, opened, swipes };
}

test('the final cover-deduplicated slide list controls pagination totals and whether swiping is enabled', () => {
  const first = file('first', 'image', 0), second = file('second', 'image', 1);
  const projectFields = { cover: '/thumbnail.webp', coverThumbnail: { sourceAttachmentId: 'first' } };
  const single = inlineRendererFixture({ attachments: [first], selected: 0, projectFields });
  assert.equal(single.tree.props['data-inline-slide-count'], 1);
  assert.equal(single.nodes.some(node => node.props.role === 'slider'), false);
  assert.deepEqual(single.swipes, [{ enabled: false, selected: 0, total: 1 }]);
  const multiple = inlineRendererFixture({ attachments: [first, second], selected: 1, projectFields });
  const slider = multiple.nodes.find(node => node.props.role === 'slider');
  assert.equal(multiple.tree.props['data-inline-slide-count'], 2);
  assert.equal(slider.props['aria-valuemax'], 2); assert.equal(slider.props['aria-valuenow'], 2);
  assert.equal(multiple.nodes.filter(node => node.props.className === 'inline-project-dot').length, 2);
  assert.deepEqual(multiple.swipes, [{ enabled: true, selected: 1, total: 2 }]);
  assert.equal(multiple.nodes.find(node => node.props['data-preview-open'] === '').props['data-project-continuity-artwork'], '["second",0]');
});

test('only the selected slide owns the preview opener; compact dots share one accessible pagination control', () => {
  const { nodes } = inlineRendererFixture();
  const openers = nodes.filter(node => 'data-inline-project-open' in node.props);
  assert.equal(openers.length, 3);
  const selected = openers.filter(node => node.props['data-preview-open'] === '');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].props['data-project-continuity-artwork'], '["a",0]');
  const dots = nodes.filter(node => node.props.className === 'inline-project-dot');
  assert.equal(dots.length, 4);
  assert.ok(dots.every(node => node.type === 'span' && !('onClick' in node.props) && !('tabIndex' in node.props)));
  assert.deepEqual(dots.filter(node => node.props['data-selected']).map(node => node.props['data-inline-dot-index']), [1]);
  const controls = nodes.filter(node => node.props.role === 'slider');
  assert.equal(controls.length, 1);
  const slider = controls[0];
  assert.equal(slider.props.tabIndex, 0); assert.equal(slider.props['aria-orientation'], 'horizontal');
  assert.equal(slider.props['aria-valuemin'], 1); assert.equal(slider.props['aria-valuemax'], 4); assert.equal(slider.props['aria-valuenow'], 2);
  assert.equal(slider.props['aria-valuetext'], 'a. Slide 2 of 4 in Project.');
  assert.equal(nodes.find(node => node.props.className === 'inline-project-dots').props['aria-hidden'], 'true');
});

function paginationEvent(overrides = {}) {
  return { clientX: 0, detail: 1, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
}

test('compact pagination selects the nearest real dot without opening the project or bubbling', () => {
  const h = inlineRendererFixture();
  const slider = h.nodes.find(node => node.props.role === 'slider');
  const dots = h.nodes.filter(node => node.props.className === 'inline-project-dot');
  const targets = dots.map((node, offset) => ({ dataset: { inlineDotIndex: String(node.props['data-inline-dot-index']) },
    getBoundingClientRect: () => ({ left: 100 + offset * 11, width: 5 }) }));
  const currentTarget = { querySelectorAll: selector => { assert.equal(selector, '[data-inline-dot-index]'); return targets; } };
  const click = paginationEvent({ clientX: 124, currentTarget });
  slider.props.onClick(click);
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  assert.deepEqual(plain(h.calls), [{ index: 2, key: 'b:image', attachmentId: 'b', page: 2 }]);
  assert.deepEqual(h.opened, []);
  const synthetic = paginationEvent({ detail: 0, clientX: 100, currentTarget }); slider.props.onClick(synthetic);
  assert.equal(synthetic.prevented, true); assert.equal(synthetic.stopped, true); assert.equal(h.calls.length, 1);
});

test('pagination keyboard selection is bounded, keeps its own focus and never opens a project', () => {
  const h = inlineRendererFixture(); const slider = h.nodes.find(node => node.props.role === 'slider');
  for (const [key, expected] of [['ArrowLeft', 0], ['ArrowRight', 2], ['ArrowUp', 2], ['ArrowDown', 0], ['Home', 0], ['End', 3]]) {
    const event = paginationEvent({ key }); slider.props.onKeyDown(event);
    assert.equal(event.prevented, true); assert.equal(event.stopped, true); assert.equal(h.calls.at(-1).index, expected);
  }
  const count = h.calls.length, ignored = paginationEvent({ key: 'Tab' }); slider.props.onKeyDown(ignored);
  assert.equal(ignored.prevented, false); assert.equal(ignored.stopped, false); assert.equal(h.calls.length, count); assert.deepEqual(h.opened, []);
  const first = inlineRendererFixture({ selected: 0 }), firstSlider = first.nodes.find(node => node.props.role === 'slider');
  firstSlider.props.onKeyDown(paginationEvent({ key: 'ArrowLeft' })); assert.deepEqual(first.calls, []);
  firstSlider.props.onKeyDown(paginationEvent({ key: 'ArrowDown' })); assert.deepEqual(first.calls, []);
  const last = inlineRendererFixture({ selected: 3 }), lastSlider = last.nodes.find(node => node.props.role === 'slider');
  lastSlider.props.onKeyDown(paginationEvent({ key: 'ArrowRight' })); assert.deepEqual(last.calls, []);
  lastSlider.props.onKeyDown(paginationEvent({ key: 'ArrowUp' })); assert.deepEqual(last.calls, []);
});

test('single-slide, unresolved and tiny cards have no pagination; retained cards cannot select pages', () => {
  for (const options of [{ attachments: [], selected: 0 }, { metadataComplete: false }, { width: 120 }]) {
    const h = inlineRendererFixture(options);
    assert.equal(h.nodes.some(node => node.props.role === 'slider'), false);
  }
  const h = inlineRendererFixture({ active: false }), slider = h.nodes.find(node => node.props.role === 'slider');
  assert.equal(slider.props.tabIndex, -1); assert.equal(slider.props['aria-disabled'], true);
  slider.props.onClick(paginationEvent()); slider.props.onKeyDown(paginationEvent({ key: 'ArrowRight' }));
  assert.deepEqual(h.calls, []); assert.deepEqual(h.opened, []);
});

test('a long project shows actual moving-window indexes and announces the selected real page', () => {
  const h = inlineRendererFixture({ attachments: Array.from({ length: 12 }, (_, index) => file(`page-${index + 1}`, 'image', index)), selected: 7 });
  const slider = h.nodes.find(node => node.props.role === 'slider');
  const dots = h.nodes.filter(node => node.props.className === 'inline-project-dot');
  assert.deepEqual(dots.map(node => node.props['data-inline-dot-index']), [5, 6, 7, 8, 9]);
  assert.deepEqual(dots.filter(node => node.props['data-selected']).map(node => node.props['data-inline-dot-index']), [7]);
  assert.equal(slider.props['aria-valuemax'], 13); assert.equal(slider.props['aria-valuenow'], 8);
  assert.equal(slider.props['aria-valuetext'], 'page-7. Slide 8 of 13 in Project.');
});

function gestureFixture({ enabled = true, selected = 1, total = 4 } = {}) {
  const slots = [], effects = [], calls = [], captures = [], releases = [], captured = new Set();
  let cursor = 0;
  const react = { ...React,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useCallback(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((dep, index) => !Object.is(dep, old.deps[index]))) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((dep, index) => !Object.is(dep, old.deps[index]))) { slots[i] = { deps }; effects.push(fn); } },
  };
  const api = sourceModule('src/components/profile/useInlineProjectSwipe.ts', { react, './inlineProjectPageModel': model }, { window: { innerWidth: 420 } });
  const render = () => { cursor = 0; const state = api.useInlineProjectSwipe(enabled, selected, total, index => { calls.push(index); selected = index; }); effects.splice(0).forEach(fn => fn()); return state; };
  const host = { clientWidth: 356, setPointerCapture(id) { captures.push(id); captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); }, releasePointerCapture(id) { releases.push(id); captured.delete(id); } };
  const child = { closest: () => null };
  const event = (x, y, time, overrides = {}) => ({ clientX: x, clientY: y, timeStamp: time, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    target: child, currentTarget: host,
    prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides });
  const click = (detail = 1) => event(0, 0, 0, { detail });
  return { render, event, click, calls, captures, releases, host, child, setEnabled(value) { enabled = value; } };
}

test('actual swipe hook captures horizontal intent only, advances on release and consumes the following click', () => {
  const h = gestureFixture();
  h.render().handlers.onPointerDownCapture(h.event(250, 100, 0));
  const move = h.event(170, 105, 90); h.render().handlers.onPointerMoveCapture(move);
  assert.equal(move.prevented, true); assert.deepEqual(h.captures, [1]); assert.equal(h.render().offset, -80); assert.deepEqual(h.calls, []);
  h.render().handlers.onPointerUpCapture(h.event(170, 105, 100));
  assert.deepEqual(h.calls, [2]); assert.equal(h.render().offset, 0); assert.equal(h.render().dragging, false);
  assert.deepEqual(h.releases, [1]);
  const click = h.click(); h.render().handlers.onClickCapture(click); assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  const next = h.click(); h.render().handlers.onClickCapture(next); assert.equal(next.prevented, false);
});

test('actual hook gives vertical gestures and browser edges back to native scrolling and ignores controls', () => {
  for (const control of [true, false]) {
    const h = gestureFixture();
    h.render().handlers.onPointerDownCapture(h.event(control ? 200 : 12, 100, 0, control ? { target: { closest: () => ({ hasAttribute: () => false }) } } : {}));
    h.render().handlers.onPointerMoveCapture(h.event(100, 101, 100)); h.render().handlers.onPointerUpCapture(h.event(100, 101, 130));
    assert.deepEqual(h.calls, []); assert.deepEqual(h.captures, []);
  }
  const h = gestureFixture(); h.render().handlers.onPointerDownCapture(h.event(250, 100, 0));
  const vertical = h.event(240, 150, 90); h.render().handlers.onPointerMoveCapture(vertical);
  assert.equal(vertical.prevented, false); assert.deepEqual(h.captures, []);
  h.render().handlers.onPointerMoveCapture(h.event(100, 160, 100)); h.render().handlers.onPointerUpCapture(h.event(100, 160, 130));
  assert.deepEqual(h.calls, []); assert.equal(h.render().offset, 0);
});

test('cancelled, incomplete and disabled gestures settle without navigation; keyboard clicks stay usable', () => {
  const h = gestureFixture(); h.render().handlers.onPointerDownCapture(h.event(250, 100, 0));
  h.render().handlers.onPointerMoveCapture(h.event(230, 101, 300)); h.render().handlers.onPointerUpCapture(h.event(230, 101, 400));
  assert.deepEqual(h.calls, []); assert.equal(h.render().offset, 0);
  const keyboardClick = h.click(0); h.render().handlers.onClickCapture(keyboardClick); assert.equal(keyboardClick.prevented, false);
  h.render().handlers.onPointerDownCapture(h.event(250, 100, 500)); h.render().handlers.onPointerMoveCapture(h.event(150, 101, 550));
  h.render().handlers.onPointerCancel(h.event(150, 101, 560)); assert.equal(h.render().offset, 0); assert.deepEqual(h.calls, []);
  h.setEnabled(false); h.render().handlers.onPointerDownCapture(h.event(250, 100, 600)); h.render().handlers.onPointerMoveCapture(h.event(150, 101, 650)); h.render().handlers.onPointerUpCapture(h.event(150, 101, 700));
  assert.deepEqual(h.calls, []); assert.equal(h.render().dragging, false);
});

test('touch capture transfer from the touched descendant preserves the swipe through release', () => {
  const h = gestureFixture();
  h.render().handlers.onPointerDownCapture(h.event(250, 100, 0));
  h.render().handlers.onPointerMoveCapture(h.event(200, 102, 70));
  assert.equal(h.render().dragging, true); assert.equal(h.render().offset, -50);
  // Direct touch implicitly captured the initial image/link. Transferring that
  // capture to the carousel emits lostpointercapture on the child and bubbles.
  h.render().handlers.onLostPointerCapture(h.event(200, 102, 71));
  assert.equal(h.render().dragging, true); assert.equal(h.render().offset, -50);
  assert.deepEqual(h.releases, []);
  h.render().handlers.onPointerMoveCapture(h.event(150, 104, 100));
  h.render().handlers.onPointerUpCapture(h.event(150, 104, 120));
  assert.deepEqual(h.calls, [2]); assert.deepEqual(h.releases, [1]);
  const click = h.click(); h.render().handlers.onClickCapture(click);
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
});

test('only a matching loss of the carousel host capture cancels an in-progress swipe', () => {
  const h = gestureFixture();
  h.render().handlers.onPointerDownCapture(h.event(250, 100, 0));
  h.render().handlers.onPointerMoveCapture(h.event(150, 102, 80));
  h.render().handlers.onLostPointerCapture(h.event(150, 102, 81, { target: h.host, pointerId: 2 }));
  assert.equal(h.render().dragging, true); assert.equal(h.render().offset, -100);
  h.render().handlers.onPointerCancel(h.event(150, 102, 82, { pointerId: 2 }));
  h.render().handlers.onPointerUpCapture(h.event(150, 102, 83, { pointerId: 2 }));
  assert.equal(h.render().dragging, true);
  h.render().handlers.onLostPointerCapture(h.event(150, 102, 84, { target: h.host }));
  assert.equal(h.render().dragging, false); assert.equal(h.render().offset, 0);
  h.render().handlers.onPointerUpCapture(h.event(150, 102, 100));
  assert.deepEqual(h.calls, []);
});

test('turning off inline mode mid-swipe releases its capture without selecting a page', () => {
  const h = gestureFixture();
  h.render().handlers.onPointerDownCapture(h.event(250, 100, 0));
  h.render().handlers.onPointerMoveCapture(h.event(150, 102, 80));
  h.setEnabled(false); h.render();
  assert.equal(h.render().dragging, false); assert.equal(h.render().offset, 0);
  assert.deepEqual(h.releases, [1]);
  h.render().handlers.onPointerUpCapture(h.event(150, 102, 100));
  assert.deepEqual(h.calls, []);
});

test('a plain touch tap and a mouse click remain project openers; horizontal mouse drags still select pages', () => {
  for (const pointerType of ['touch', 'mouse']) {
    const h = gestureFixture();
    h.render().handlers.onPointerDownCapture(h.event(250, 100, 0, { pointerType }));
    h.render().handlers.onPointerUpCapture(h.event(250, 100, 100, { pointerType }));
    const click = h.click(); h.render().handlers.onClickCapture(click);
    assert.equal(click.prevented, false); assert.equal(click.stopped, false);
    assert.deepEqual(h.calls, []); assert.deepEqual(h.captures, []);
  }
  const h = gestureFixture();
  h.render().handlers.onPointerDownCapture(h.event(250, 100, 0, { pointerType: 'mouse' }));
  h.render().handlers.onPointerMoveCapture(h.event(150, 102, 80, { pointerType: 'mouse' }));
  h.render().handlers.onPointerUpCapture(h.event(150, 102, 100, { pointerType: 'mouse' }));
  assert.deepEqual(h.calls, [2]); assert.deepEqual(h.releases, [1]);
});

test('disabled paging and a final single cover still suppress drag-to-open without capturing or shifting content', () => {
  for (const pointerType of ['touch', 'mouse']) {
    for (const options of [{ enabled: false, selected: 0, total: 1 }, { enabled: false, selected: 1, total: 4 }]) {
      const h = gestureFixture(options);
      h.render().handlers.onPointerDownCapture(h.event(250, 100, 0, { pointerType }));
      const move = h.event(150, 104, 80, { pointerType }); h.render().handlers.onPointerMoveCapture(move);
      assert.equal(move.prevented, false); assert.equal(move.stopped, false);
      assert.equal(h.render().offset, 0); assert.equal(h.render().dragging, false);
      h.render().handlers.onPointerUpCapture(h.event(150, 104, 100, { pointerType }));
      assert.deepEqual(h.calls, []); assert.deepEqual(h.captures, []); assert.deepEqual(h.releases, []);
      const click = h.click(); h.render().handlers.onClickCapture(click);
      assert.equal(click.prevented, true); assert.equal(click.stopped, true);
      const keyboardClick = h.click(0); h.render().handlers.onClickCapture(keyboardClick);
      assert.equal(keyboardClick.prevented, false); assert.equal(keyboardClick.stopped, false);
    }
  }
});

test('vertical drags over a single remaining cover retain native scrolling and cannot open the reader', () => {
  for (const pointerType of ['touch', 'mouse']) {
    const h = gestureFixture({ enabled: false, selected: 0, total: 1 });
    h.render().handlers.onPointerDownCapture(h.event(250, 100, 0, { pointerType }));
    const move = h.event(246, 190, 80, { pointerType }); h.render().handlers.onPointerMoveCapture(move);
    assert.equal(move.prevented, false); assert.equal(move.stopped, false);
    h.render().handlers.onPointerCancel(h.event(246, 190, 90, { pointerType }));
    assert.equal(h.render().offset, 0); assert.equal(h.render().dragging, false);
    assert.deepEqual(h.calls, []); assert.deepEqual(h.captures, []);
    const click = h.click(); h.render().handlers.onClickCapture(click);
    assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  }
});

test('a fresh tap or small pointer jitter opens normally when paging is disabled', () => {
  for (const pointerType of ['touch', 'mouse']) {
    const h = gestureFixture({ enabled: false, selected: 0, total: 1 });
    h.render().handlers.onPointerDownCapture(h.event(250, 100, 0, { pointerType }));
    h.render().handlers.onPointerMoveCapture(h.event(150, 104, 80, { pointerType }));
    h.render().handlers.onPointerUpCapture(h.event(150, 104, 100, { pointerType }));
    h.render().handlers.onClickCapture(h.click());
    h.render().handlers.onPointerDownCapture(h.event(200, 100, 150, { pointerType }));
    const jitter = h.event(197, 102, 180, { pointerType }); h.render().handlers.onPointerMoveCapture(jitter);
    h.render().handlers.onPointerUpCapture(h.event(197, 102, 200, { pointerType }));
    const click = h.click(); h.render().handlers.onClickCapture(click);
    assert.equal(jitter.prevented, false); assert.equal(click.prevented, false); assert.equal(click.stopped, false);
    assert.deepEqual(h.calls, []); assert.deepEqual(h.captures, []);
  }
});
