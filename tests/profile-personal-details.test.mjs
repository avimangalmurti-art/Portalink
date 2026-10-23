import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, File, Blob, Error, ...globals, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency ${name}`);
    return imports[name];
  } });
  return exports;
}
const validation = load('src/features/profile/validation.ts', { '../sharing/shareModel': {} });
const avatarValidation = load('src/features/profile/avatarValidation.ts');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children ?? []);
function walk(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach(child => walk(child, predicate, found));
  else if (node && typeof node === 'object') { if (predicate(node)) found.push(node); walk(node.props?.children, predicate, found); }
  return found;
}
function hooks() {
  const slots = [];
  let cursor = 0, dirty = true, effects = [], mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => {
        if (!mounted) return;
        const next = typeof update === 'function' ? update(slots[i].value) : update;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(factory, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = cursor++, before = slots[i];
      if (!same(before?.deps, deps)) { slots[i] = { deps }; effects.push(() => { before?.cleanup?.(); slots[i].cleanup = effect(); }); }
    },
  };
  return { react, get dirty() { return dirty; }, request() { dirty = true; },
    render(callback) { dirty = false; cursor = 0; effects = []; const tree = callback(); effects.forEach(effect => effect()); return tree; },
    dispose() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function personal(options = {}) {
  const h = hooks(), done = [], busy = [], validity = [], dirtiness = [], created = [], revoked = [];
  const media = { getUploadCapability: async () => ({ isAvailable: true }) };
  const { useAvatarSelection } = load('src/features/profile/useProfileOnboarding.ts', {
    react: h.react, '../../contexts/ServicesContext': { useServices: () => ({ media }) }, '../../contexts/AuthContext': {}, '../../hooks/useAsyncAction': {},
    './validation': validation, '../../utils/imageMetadata': { readImageDimensions: async () => ({ widthPixels: 640, heightPixels: 640 }) }, '../auth/registration': {}, './avatarValidation': avatarValidation,
  }, { URL: { createObjectURL(file) { const url = `blob:scratch-${created.length}`; created.push({ file, url }); return url; }, revokeObjectURL: url => revoked.push(url) } });
  const { ProfilePersonalDetails } = load('src/features/profile/ProfilePersonalDetails.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    '../../components/profile/MobileProfileAvatarEditor': { MobileProfileAvatarEditor: 'avatar-editor' },
    '../../components/profile/ProfileLocationPicker': { ProfileLocationPicker: 'location-picker' },
    './useProfileOnboarding': { useAvatarSelection }, './validation': validation,
  });
  let props = { name: 'Original name', location: 'San Francisco, USA', avatar: null, currentUrl: 'https://images.test/saved.webp', disabled: false,
    onBusyChange: value => busy.push(value), onDirtyChange: value => dirtiness.push(value), onValidityChange: value => validity.push(value),
    onDone: details => { done.push(details); return options.result?.(details); }, ...options.props };
  let tree;
  const render = () => { if (h.dirty) tree = h.render(() => ProfilePersonalDetails(props)); return tree; };
  const find = predicate => walk(render(), predicate)[0] ?? null;
  return { done, busy, validity, dirtiness, created, revoked, find,
    avatar: () => find(n => n.type === 'avatar-editor'), name: () => find(n => n.type === 'input' && n.props.name === 'name'),
    location: () => find(n => n.type === 'location-picker'), form: () => find(n => n.type === 'form'),
    changeName(value) { this.name().props.onChange({ target: { value } }); }, changeLocation(value) { this.location().props.onChange(value); },
    submit() { this.form().props.onSubmit({ preventDefault() {} }); },
    options(next) { props = { ...props, ...next }; h.request(); },
    async flush() { for (let i = 0; i < 16; i++) { render(); await Promise.resolve(); } },
    dispose() { h.dispose(); },
  };
}
function photo(options = {}) {
  const h = hooks(), busy = [], selected = [], focus = [], fileInput = { clicks: 0, click() { this.clicks++; } };
  const { MobileProfileAvatarEditor } = load('src/components/profile/MobileProfileAvatarEditor.tsx', {
    react: h.react, 'react/jsx-runtime': jsx, 'lucide-react': { AlertCircleIcon: 'alert-icon', ImageIcon: 'image-icon', MoveIcon: 'move-icon', UploadIcon: 'upload-icon' },
    '../ui/ResponsiveImage': { ResponsiveImage: 'image' }, './ProfilePhotoEditor': { ProfilePhotoEditor: 'cropper' }, '../../features/profile/avatarValidation': avatarValidation,
    '../../hooks/useModalFocus': { useModalFocus: (open, ref, dismiss, preventScroll) => { focus.push({ open, ref, dismiss, preventScroll }); } },
    '../ui/ModalPortal': { ModalPortal: 'modal-portal' }, './profilePhotoSettings.css': {},
  });
  let props = { appearance: 'settings', pending: null, error: null, currentUrl: 'https://images.test/saved.webp', onBusyChange: value => busy.push(value),
    onSelect(file, framing) { selected.push({ file, framing }); props = { ...props, pending: { file, ...framing, previewUrl: 'blob:prepared' } }; h.request(); }, onClear() {}, ...options };
  let tree;
  const render = () => {
    if (h.dirty) {
      tree = h.render(() => MobileProfileAvatarEditor(props));
      const input = walk(tree, n => n.type === 'input' && n.props.type === 'file')[0];
      input.props.ref.current = fileInput;
    }
    return tree;
  };
  const all = predicate => walk(render(), predicate);
  return { busy, selected, focus, fileInput, all,
    button: name => all(n => n.type === 'button' && text(n) === name)[0],
    buttons: name => all(n => n.type === 'button' && text(n) === name),
    cropper: () => all(n => n.type === 'cropper')[0] ?? null,
    dialog: () => all(n => n.props?.role === 'dialog')[0] ?? null,
    choose(file) { all(n => n.type === 'input' && n.props.type === 'file')[0].props.onChange({ currentTarget: { files: [file], value: file.name } }); },
    options(next) { props = { ...props, ...next }; h.request(); },
    async flush() { for (let i = 0; i < 10; i++) { render(); await Promise.resolve(); } },
    dispose() { h.dispose(); },
  };
}
const crop = { x: .2, y: .1, width: .6, height: .6, zoom: 1.5 };
const pixels = () => ({ blob: new Blob(['pixels'], { type: 'image/webp' }), crop });
const prepared = () => ({ file: new File(['old'], 'saved.webp', { type: 'image/webp' }), previewUrl: 'blob:root-owned', fileName: 'saved.webp', sizeBytes: 3, isPersisted: false, originalSource: 'https://images.test/original.jpg', crop });

test('Personal details reports initial validity and pristine state and uses the existing local fields', async () => {
  const h = personal(); await h.flush();
  assert.equal(h.form().props.id, 'profile-personal-form');
  assert.equal(h.validity.at(-1), true); assert.equal(h.dirtiness.at(-1), false);
  assert.equal(h.name().props.maxLength, 48); assert.equal(h.name().props.autoComplete, 'name');
  assert.equal(h.location().props.value, 'San Francisco, USA'); assert.equal(h.avatar().props.appearance, 'settings');
  assert.equal(h.find(n => n.type === 'button' && ['Done', 'Save', 'Back'].includes(text(n))), null, 'the parent owns navigation');
  assert.equal(h.done.length, 0); h.dispose();
});

test('typing remains local until Done, then sends trimmed optional location and blocks duplicate handoffs', async () => {
  const h = personal(); await h.flush(); h.changeName('  New name  '); h.changeLocation('  '); await h.flush();
  assert.equal(h.dirtiness.at(-1), true); assert.equal(h.validity.at(-1), true); assert.equal(h.done.length, 0);
  h.submit(); h.submit(); await h.flush();
  assert.equal(h.done.length, 1); assert.equal(h.done[0].name, 'New name'); assert.equal(h.done[0].location, ''); assert.equal(h.done[0].avatar, null);
  h.dispose();
});

test('required name and the existing 48 character limits invalidate Done and show field errors', async () => {
  const h = personal(); await h.flush(); h.changeName(' '); await h.flush(); h.submit(); await h.flush();
  assert.equal(h.validity.at(-1), false); assert.equal(h.name().props['aria-invalid'], true);
  assert.match(text(h.find(n => n.props?.id === 'profile-personal-name-error')), /Enter the name/);
  h.changeName('N'.repeat(49)); await h.flush(); assert.equal(h.validity.at(-1), false);
  h.changeName('Valid'); h.changeLocation('L'.repeat(49)); await h.flush();
  assert.equal(h.validity.at(-1), false); assert.match(h.location().props.error, /48 characters/);
  h.submit(); assert.equal(h.done.length, 0);
  h.changeLocation(''); await h.flush(); assert.equal(h.validity.at(-1), true); h.dispose();
});

test('unchanging a field restores pristine state without mutating the parent', async () => {
  const h = personal(); await h.flush(); h.changeName('Changed'); await h.flush(); assert.equal(h.dirtiness.at(-1), true);
  h.changeName('Original name'); await h.flush(); assert.equal(h.dirtiness.at(-1), false); assert.equal(h.done.length, 0); h.dispose();
});

test('outer disabled and an open photo transaction both prevent Done', async () => {
  const h = personal({ props: { disabled: true } }); await h.flush(); h.submit(); assert.equal(h.done.length, 0);
  assert.equal(h.avatar().props.disabled, true); assert.equal(h.location().props.disabled, true);
  h.options({ disabled: false }); await h.flush(); h.avatar().props.onBusyChange(true); h.submit(); assert.equal(h.done.length, 0); assert.equal(h.busy.at(-1), true);
  h.avatar().props.onBusyChange(false); h.submit(); assert.equal(h.done.length, 1); assert.equal(h.busy.at(-1), false); h.dispose();
});

test('a new photo stays in scratch storage; Back releases only its URLs and never the root pending avatar', async () => {
  const original = prepared(), h = personal({ props: { avatar: original } }); await h.flush();
  assert.equal(h.avatar().props.pending, original);
  const file = new File(['new pixels'], 'new.jpg', { type: 'image/jpeg' });
  h.avatar().props.onSelect(file, { originalSource: 'source.jpg', crop }); await h.flush();
  assert.equal(h.avatar().props.pending.file, file); assert.equal(h.avatar().props.pending.originalSource, 'source.jpg');
  assert.equal(h.dirtiness.at(-1), true); assert.equal(h.done.length, 0); assert.equal(h.revoked.length, 0);
  h.dispose(); assert.deepEqual(h.revoked, ['blob:scratch-0']); assert.equal(original.previewUrl, 'blob:root-owned');
});

test('Done hands the parent the prepared File before scratch cleanup, and keeps the root selection after scratch Undo', async () => {
  const original = prepared(), h = personal({ props: { avatar: original } }); await h.flush();
  h.avatar().props.onSelect(new File(['new'], 'new.png', { type: 'image/png' }), { originalSource: 'source.png', crop }); await h.flush();
  h.avatar().props.onClear(); await h.flush(); assert.equal(h.avatar().props.pending, original); assert.equal(h.dirtiness.at(-1), false);
  h.avatar().props.onSelect(new File(['newer'], 'newer.png', { type: 'image/png' }), { originalSource: 'source.png', crop }); await h.flush();
  const local = h.avatar().props.pending; h.submit();
  assert.equal(h.done[0].avatar, local); assert.equal(h.revoked.includes(local.previewUrl), false);
  h.dispose(); assert.equal(h.revoked.includes(local.previewUrl), true); assert.equal(h.revoked.includes(original.previewUrl), false);
});

test('Done with no child photo change leaves root-owned selection intact instead of re-preparing it', async () => {
  const original = prepared(), h = personal({ props: { avatar: original } }); await h.flush();
  assert.equal(h.avatar().props.pending, original); h.changeName('New name'); await h.flush(); h.submit();
  assert.equal(h.done[0].avatar, null, 'null means keep the parent selection');
  h.dispose(); assert.deepEqual(h.revoked, []);
});

test('failed preparation keeps local text and photo, exposes a useful error, and permits Done retry', async () => {
  let fail = true;
  const h = personal({ result() { return fail ? false : true; } }); await h.flush(); h.changeName('Retry me');
  h.avatar().props.onSelect(new File(['new'], 'new.webp', { type: 'image/webp' })); await h.flush(); const pending = h.avatar().props.pending;
  h.submit(); await h.flush(); assert.match(text(h.find(n => n.props?.role === 'alert')), /could not be prepared.*Try again/);
  assert.equal(h.name().props.value, 'Retry me'); assert.equal(h.avatar().props.pending, pending);
  fail = false; h.submit(); await h.flush(); assert.equal(h.done.length, 2); assert.equal(h.done[1].avatar, pending); h.dispose();
});

test('exceptions at the adoption boundary remain visible without losing the draft', async () => {
  const h = personal({ result() { throw Error('Could not read the selected photo.'); } }); await h.flush(); h.changeLocation('London'); await h.flush(); h.submit(); await h.flush();
  assert.match(text(h.find(n => n.props?.role === 'alert')), /Could not read the selected photo/);
  assert.equal(h.location().props.value, 'London'); h.changeName('Try again'); await h.flush();
  assert.equal(h.find(n => n.props?.role === 'alert'), null); h.dispose();
});

test('invalid replacement preserves the root photo and passes the existing validation error to the photo surface', async () => {
  const original = prepared(), h = personal({ props: { avatar: original } }); await h.flush();
  assert.equal(h.avatar().props.onSelect(new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })), false); await h.flush();
  assert.equal(h.avatar().props.pending, original); assert.match(h.avatar().props.error, /PNG, JPEG, WebP, or GIF/);
  assert.equal(h.dirtiness.at(-1), false); h.dispose(); assert.equal(h.revoked.length, 0);
});

test('settings Edit photo and preview open one focus-trapped choice sheet with the exact row handlers', async () => {
  const h = photo({ children: { type: 'profile-info', props: {} } }); await h.flush();
  assert.equal(h.button('Undo photo changes'), undefined); assert.equal(h.all(n => n.type === 'profile-info').length, 1);
  h.button('Edit photo').props.onClick(); await h.flush();
  assert.ok(h.dialog()); assert.equal(h.dialog().props['aria-label'], 'Edit photo'); assert.equal(h.dialog().props['aria-modal'], 'true');
  assert.equal(h.focus.at(-1).open, true); assert.equal(h.focus.at(-1).preventScroll, true);
  assert.equal(h.buttons('Replace photo').length, 2); assert.equal(h.buttons('Replace photo')[0].props.onClick, h.buttons('Replace photo')[1].props.onClick);
  assert.equal(h.buttons('Reposition photo')[0].props.onClick, h.buttons('Reposition photo')[1].props.onClick);
  h.focus.at(-1).dismiss(); await h.flush(); assert.equal(h.dialog(), null); assert.equal(h.selected.length, 0);
  h.all(n => n.type === 'button' && n.props.className === 'mobile-profile-avatar-preview')[0].props.onClick(); await h.flush(); assert.ok(h.dialog());
  h.button('Cancel').props.onClick(); await h.flush(); assert.equal(h.dialog(), null); h.dispose();
});

test('settings Replace preserves user activation for the file picker and only opens the existing crop editor after a valid file', async () => {
  const h = photo(); await h.flush(); h.button('Edit photo').props.onClick(); await h.flush();
  h.buttons('Replace photo')[1].props.onClick(); assert.equal(h.fileInput.clicks, 1); await h.flush(); assert.equal(h.dialog(), null); assert.equal(h.cropper(), null);
  const file = new File(['pixels'], 'new.jpg', { type: 'image/jpeg' }); h.choose(file); await h.flush();
  assert.equal(h.cropper().props.source, file); assert.equal(h.busy.at(-1), true); assert.equal(h.selected.length, 0);
  h.cropper().props.onCancel(); await h.flush(); assert.equal(h.selected.length, 0); assert.equal(h.busy.at(-1), false); h.dispose();
});

test('settings Reposition keeps original source and saved crop; saving once prepares locally and reopening continues that crop', async () => {
  const initial = prepared(), h = photo({ pending: initial, storageNotice: 'Preview only; storage unavailable.' }); await h.flush();
  assert.equal(h.all(n => text(n) === 'Preview only; storage unavailable.').length, 0);
  h.button('Edit photo').props.onClick(); await h.flush(); h.buttons('Reposition photo')[1].props.onClick(); await h.flush();
  assert.equal(h.dialog(), null); assert.equal(h.cropper().props.source, initial.originalSource); assert.equal(h.cropper().props.initialCrop, crop);
  await h.cropper().props.onSave(pixels()); await h.flush(); assert.equal(h.selected.length, 1); assert.equal(h.selected[0].framing.originalSource, initial.originalSource);
  assert.equal(h.cropper(), null); assert.equal(h.busy.at(-1), false);
  h.button('Reposition photo').props.onClick(); await h.flush(); assert.equal(h.cropper().props.initialCrop, crop); assert.equal(h.cropper().props.source, initial.originalSource); h.dispose();
});

test('settings handles absent photos, disabled actions, backdrop dismissal and original validation without clearing a photo', async () => {
  const h = photo({ currentUrl: undefined, currentInitials: 'PN' }); await h.flush();
  assert.equal(h.button('Reposition photo').props.disabled, true); h.button('Edit photo').props.onClick(); await h.flush();
  assert.equal(h.buttons('Reposition photo')[1].props.disabled, true);
  const backdrop = h.all(n => n.props?.className === 'profile-photo-choices-backdrop')[0];
  backdrop.props.onClick({ target: {}, currentTarget: {} }); await h.flush(); assert.ok(h.dialog(), 'inside clicks do not dismiss');
  const target = {}; backdrop.props.onClick({ target, currentTarget: target }); await h.flush(); assert.equal(h.dialog(), null);
  h.choose(new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })); await h.flush(); assert.equal(h.cropper(), null); assert.match(text(h.all(n => n.props?.role === 'alert')[0]), /PNG, JPEG/);
  h.options({ disabled: true }); await h.flush(); h.button('Edit photo').props.onClick(); assert.equal(h.dialog(), null); assert.equal(h.button('Replace photo').props.disabled, true); h.dispose();
});
