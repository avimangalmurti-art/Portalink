import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : node == null ? '' : String(node);
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const originalLink = () => ({ id: 'existing-link', label: 'Portfolio', href: 'example.com/work', iconName: 'globe' });
const iconOptions = [
  { name: 'globe', label: 'Website', isBrand: false },
  { name: 'camera', label: 'Camera', isBrand: false },
  { name: 'instagram', label: 'Instagram', isBrand: true },
];
const icons = { profileLinkIconNames: iconOptions.map(option => option.name), profileLinkIconOptions: iconOptions,
  getCategoryIcon: name => `icon-${name}`, getPortalIconLabel: name => iconOptions.find(option => option.name === name)?.label ?? name };
const profileLinks = sourceModule('src/features/profile/profileLinks.ts', { '../../components/profile/categoryIcons': icons });
const validation = sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': sourceModule('src/features/sharing/shareModel.ts') });

/** Actual child, validation and icon inference. The picker exposes only its
 * existing Cancel/Done contract; no parent draft or profile service is mocked. */
function fixture(options = {}) {
  const link = 'link' in options ? options.link : originalLink();
  const before = link && JSON.parse(JSON.stringify(link));
  const slots = [], adopted = [], removed = [], dirtiness = [], validity = [];
  let cursor = 0, effects = [], dirty = true, tree, mounted = true, disabled = options.disabled ?? false;
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, update => { assert.equal(mounted, true, 'A disposed child cannot receive UI state changes'); const next = typeof update === 'function' ? update(slots[index].value) : update; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }]; },
    useEffect(callback, dependencies) { const index = cursor++, previous = slots[index]; if (!same(previous?.dependencies, dependencies)) {
      const slot = slots[index] = { dependencies }; effects.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); });
    } },
  };
  const { ProfileLinkDetails } = sourceModule('src/features/profile/ProfileLinkDetails.tsx', {
    react, 'lucide-react': { ChevronRightIcon: 'chevron' }, '../../components/profile/categoryIcons': icons,
    './ProfileLinkIconPicker': { ProfileLinkIconPicker: 'icon-picker' }, './profileLinks': profileLinks, './validation': validation,
  }, { React });
  const callbacks = { onDone(value) { adopted.push(value); }, onRemove() { removed.push(link?.id); }, onDirtyChange(value) { dirtiness.push(value); }, onValidityChange(value) { validity.push(value); } };
  function render() {
    if (!mounted) return tree;
    for (let pass = 0; dirty; pass++) { assert.ok(pass < 15); dirty = false; cursor = 0; effects = []; tree = ProfileLinkDetails({ link, disabled, ...callbacks }); effects.splice(0).forEach(run => run()); }
    return tree;
  }
  render();
  return { link, before, adopted, removed, dirtiness, validity, render,
    all() { return nodes(render()); },
    input(name) { return this.all().find(node => node.type === 'input' && node.props.name === name); },
    button(label) { return this.all().find(node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label)); },
    change(name, value) { this.input(name).props.onChange({ target: { value } }); render(); },
    submit() { render().props.onSubmit({ preventDefault() {} }); render(); },
    chooseIcon() { this.all().find(node => node.type === 'button' && node.props['aria-haspopup'] === 'dialog').props.onClick(); render(); return this.picker(); },
    picker() { return this.all().find(node => node.type === 'icon-picker'); },
    disable(value) { disabled = value; dirty = true; render(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('editing is child-local; Back/unmount never adopts, removes or mutates the original link', () => {
  const h = fixture(); h.change('linkName', 'Unconfirmed name'); h.change('linkUrl', 'https://unconfirmed.example');
  assert.equal(h.dirtiness.at(-1), true); assert.deepEqual(h.link, h.before); assert.deepEqual(h.adopted, []); assert.deepEqual(h.removed, []);
  h.unmount(); assert.deepEqual(h.link, h.before); assert.deepEqual(h.adopted, []); assert.deepEqual(h.removed, []);
  const reopened = fixture({ link: h.link }); assert.equal(reopened.input('linkName').props.value, 'Portfolio'); assert.equal(reopened.input('linkUrl').props.value, 'example.com/work'); reopened.unmount();
});

test('Done returns only the confirmed trimmed link fields while leaving its source record untouched', () => {
  const h = fixture(); h.change('linkName', '  My work  '); h.change('linkUrl', '  https://example.com/new  '); h.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(h.adopted)), [{ label: 'My work', href: 'https://example.com/new', iconName: 'globe' }]);
  assert.deepEqual(h.link, h.before); assert.deepEqual(h.removed, []); h.unmount();
});

test('new links remain invalid until both fields are valid, without prematurely adding a parent row', () => {
  const h = fixture({ link: null }); assert.equal(h.validity.at(-1), false); assert.equal(h.dirtiness.at(-1), false); assert.equal(h.button('Remove link'), undefined);
  h.submit(); assert.equal(h.adopted.length, 0); assert.equal(h.input('linkName').props['aria-invalid'], true); assert.equal(h.input('linkUrl').props['aria-invalid'], true);
  h.change('linkName', 'Site'); assert.equal(h.validity.at(-1), false); h.change('linkUrl', 'example.com'); assert.equal(h.validity.at(-1), true);
  assert.equal(h.adopted.length, 0); h.submit(); assert.equal(h.adopted.length, 1); h.unmount();
});

test('existing required, length and safe-scheme rules reject malformed child Done submissions', () => {
  for (const [name, value] of [['linkName', ' '], ['linkName', 'a'.repeat(49)], ['linkUrl', ' '], ['linkUrl', 'a'.repeat(1001)], ['linkUrl', 'https://example.com/with space'], ['linkUrl', 'javascript:alert(1)'], ['linkUrl', 'data:text/html,test'], ['linkUrl', 'vbscript:alert(1)'], ['linkUrl', 'ftp://example.com'], ['linkUrl', 'http://']]) {
    const h = fixture(); h.change(name, value); h.submit(); assert.equal(h.adopted.length, 0, value); assert.equal(h.validity.at(-1), false, value);
    assert.equal(h.input(name).props['aria-invalid'], true); const errorId = h.input(name).props['aria-describedby']; assert.ok(h.all().some(node => node.props.id === errorId && node.props.role === 'alert')); h.unmount();
  }
  for (const value of ['example.com', 'http://example.com', 'https://example.com', 'mailto:creator@example.com', 'tel:+15551234567']) {
    const h = fixture(); h.change('linkUrl', value); h.submit(); assert.equal(h.adopted.length, 1, value); h.unmount();
  }
});

test('icon Cancel keeps the child draft; icon Done affects only that draft until link Done', () => {
  const h = fixture(); let picker = h.chooseIcon(); assert.equal(picker.props.value, 'globe'); assert.equal(h.validity.at(-1), false);
  h.submit(); assert.equal(h.adopted.length, 0); picker.props.onCancel(); h.render(); assert.equal(h.validity.at(-1), true); assert.equal(h.dirtiness.at(-1), false);
  picker = h.chooseIcon(); picker.props.onDone('camera'); h.render(); assert.equal(h.dirtiness.at(-1), true); assert.equal(h.adopted.length, 0); assert.deepEqual(h.link, h.before);
  assert.equal(h.chooseIcon().props.value, 'camera'); h.picker().props.onCancel(); h.render(); h.submit(); assert.equal(h.adopted[0].iconName, 'camera'); h.unmount();
});

test('brand choice fills an empty name but retains an authored name; non-brand choices do not invent one', () => {
  const blank = fixture({ link: null }); blank.chooseIcon().props.onDone('instagram'); blank.render(); assert.equal(blank.input('linkName').props.value, 'Instagram'); assert.equal(blank.adopted.length, 0); blank.unmount();
  const named = fixture(); named.chooseIcon().props.onDone('instagram'); named.render(); assert.equal(named.input('linkName').props.value, 'Portfolio'); named.unmount();
  const ordinary = fixture({ link: null }); ordinary.chooseIcon().props.onDone('camera'); ordinary.render(); assert.equal(ordinary.input('linkName').props.value, ''); assert.equal(ordinary.validity.at(-1), false); ordinary.unmount();
});

test('default icons infer Instagram from the destination while a selected custom icon is preserved', () => {
  const inferred = fixture(); inferred.change('linkUrl', 'https://instagram.com/creator'); assert.equal(inferred.chooseIcon().props.value, 'instagram'); inferred.picker().props.onCancel(); inferred.render(); inferred.submit(); assert.equal(inferred.adopted[0].iconName, 'instagram'); inferred.unmount();
  const chosen = fixture(); chosen.chooseIcon().props.onDone('camera'); chosen.render(); chosen.change('linkUrl', 'https://instagram.com/creator'); assert.equal(chosen.chooseIcon().props.value, 'camera'); chosen.picker().props.onCancel(); chosen.render(); chosen.submit(); assert.equal(chosen.adopted[0].iconName, 'camera'); chosen.unmount();
});

test('Remove invokes the existing parent draft callback separately from Done and never rewrites the source', () => {
  const h = fixture(); h.change('linkName', 'Unconfirmed edit'); h.button('Remove link').props.onClick();
  assert.deepEqual(h.removed, ['existing-link']); assert.deepEqual(h.adopted, []); assert.deepEqual(h.link, h.before); h.unmount();
});

test('returning all local fields to their initial values clears child dirtiness', () => {
  const h = fixture(); h.change('linkName', 'Changed'); assert.equal(h.dirtiness.at(-1), true); h.change('linkName', h.before.label); assert.equal(h.dirtiness.at(-1), false); assert.deepEqual(h.adopted, []); h.unmount();
});

test('disabled details retain accessible input contracts and refuse even an explicit submit', () => {
  const h = fixture({ disabled: true }); assert.equal(h.input('linkName').props.disabled, true); assert.equal(h.input('linkName').props.maxLength, 48); assert.equal(h.input('linkUrl').props.maxLength, 1000);
  assert.equal(h.input('linkUrl').props.inputMode, 'url'); assert.equal(h.input('linkUrl').props.autoCapitalize, 'none'); assert.equal(h.button('Remove link').props.disabled, true);
  h.submit(); assert.deepEqual(h.adopted, []); h.unmount();
});
