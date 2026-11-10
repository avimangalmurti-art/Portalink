import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '');

function eventTarget(values = {}) {
  const listeners = new Map();
  return {
    ...values, listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); },
  };
}

// Executes the actual dialog and visible-viewport hook with controlled refs.
// These are lifecycle/interaction assertions, not browser layout evidence.
function harness(presentation = 'mobile', initialProps = {}) {
  const slots = [], calls = [], focusCalls = [], styles = new Map();
  const viewport = eventTarget({ height: 912, offsetTop: 0 });
  const window = eventTarget({ innerHeight: 912, visualViewport: viewport });
  const overlay = { style: { setProperty: (name, value) => styles.set(name, value) } };
  const fieldElement = { focus(options) { focusCalls.push({ target: 'field', options }); } };
  const toggleElement = { focus(options) { focusCalls.push({ target: 'toggle', options }); } };
  const scrollElement = { scrollTop: 70 };
  let cursor = 0, dirty = true, tree, effects = [], escape;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++, prior = slots[index];
      if (!same(prior?.deps, deps)) {
        slots[index] = { deps };
        effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const { useDialogViewport } = sourceModule('src/hooks/useDialogViewport.ts', { react }, { window });
  const IconLibrary = () => null;
  const { NewCategoryDialog } = sourceModule('src/components/profile/NewCategoryDialog.tsx', {
    react,
    'lucide-react': { SearchIcon: 'SearchIcon', XIcon: 'XIcon' },
    './categoryIcons': { getCategoryIcon: () => 'PreviewIcon' },
    './PortalIconLibrary': { PortalIconLibrary: IconLibrary },
    '../ui/InterfaceIcon': { InterfaceIcon: 'InterfaceIcon' },
    '../ui/ModalPortal': { ModalPortal: 'ModalPortal' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../hooks/useModalFocus': { useModalFocus(_enabled, _ref, onEscape) { escape = onEscape; } },
    '../../hooks/useDialogViewport': { useDialogViewport },
  });
  const props = { itemName: 'portal', onCancel() { calls.push('cancel'); }, onCreate(...args) { calls.push(args); }, ...initialProps };
  function render() {
    for (let pass = 0; dirty; pass++) {
      assert.ok(pass < 20, 'Dialog effects settle');
      dirty = false; cursor = 0; effects = []; tree = NewCategoryDialog(props);
      for (const node of nodes(tree)) {
        if (!node.ref) continue;
        if ('data-mobile-icon-create' in node.props) node.ref.current = overlay;
        else if (node.type === 'input') node.ref.current = fieldElement;
        else if (node.type === 'button') node.ref.current = toggleElement;
        else if ('data-portal-icon-scroll' in node.props || 'data-icon-create-body' in node.props) node.ref.current = scrollElement;
        else node.ref.current = {};
      }
      for (const effect of effects) effect();
    }
    return tree;
  }
  const find = predicate => nodes(render()).find(predicate);
  const h = {
    render, find, props, calls, focusCalls, viewport, window, styles, scrollElement,
    field: () => find(node => node.type === 'input'),
    form: () => find(node => node.type === 'form'),
    footer: () => find(node => 'data-icon-create-footer' in node.props),
    library: () => find(node => node.type === IconLibrary),
    toggle: () => find(node => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean'),
    setProps(next) { Object.assign(props, next); dirty = true; render(); },
    type(value) { h.field().props.onChange({ target: { value } }); render(); },
    submit() { let prevented = false; h.form().props.onSubmit({ preventDefault() { prevented = true; } }); render(); assert.equal(prevented, true); },
    escape() { escape(); render(); },
    dispose() { for (const slot of slots) { slot?.cleanup?.(); if (slot) delete slot.cleanup; } },
  };
  render();
  return h;
}

test('mobile New portal follows keyboard resizing and viewport panning, then removes subscriptions', t => {
  const h = harness(); t.after(() => h.dispose());
  assert.equal(h.styles.get('--dialog-viewport-height'), '912px');
  assert.equal(h.styles.get('--dialog-viewport-top'), '0px');
  assert.equal(h.viewport.listeners.size, 2); assert.equal(h.window.listeners.size, 1);
  h.viewport.height = 420; h.viewport.offsetTop = 28; h.viewport.emit('resize');
  assert.equal(h.styles.get('--dialog-viewport-height'), '420px');
  assert.equal(h.styles.get('--dialog-viewport-top'), '28px');
  h.viewport.offsetTop = 42; h.viewport.emit('scroll');
  assert.equal(h.styles.get('--dialog-viewport-top'), '42px');
  h.viewport.height = 912; h.viewport.offsetTop = 0; h.viewport.emit('resize');
  assert.equal(h.styles.get('--dialog-viewport-height'), '912px');
  assert.equal(h.styles.get('--dialog-viewport-top'), '0px');
  h.dispose();
  assert.equal(h.viewport.listeners.size, 0); assert.equal(h.window.listeners.size, 0);
});

test('mobile owns a full-screen opt-in while WEB retains its centered popup and focus policy', t => {
  for (const mode of ['mobile', 'web']) {
    const h = harness(mode); t.after(() => h.dispose());
    const root = h.find(node => 'data-mobile-icon-create' in node.props), form = h.form(), footer = h.footer();
    assert.equal(root.props['data-mobile-icon-create'], mode === 'mobile' ? 'portal' : undefined);
    assert.equal(root.props['data-presentation'], mode, 'Body-portalled screen styles retain the presentation scope');
    assert.equal(form.props['data-ui-surface'], mode === 'web' ? 'popup' : undefined);
    assert.equal(form.props.role, 'dialog'); assert.equal(form.props['aria-modal'], 'true');
    assert.equal(form.props['aria-labelledby'], 'new-category-heading');
    assert.equal(text(h.find(node => node.props.id === 'new-category-heading')), 'New portal');
    assert.ok(React.Children.toArray(form.props.children).some(node => 'data-icon-create-footer' in node.props), 'The footer stays outside the flexible body and icon scroll region');
    const catalog = h.find(node => 'data-portal-icon-scroll' in node.props);
    assert.ok(!nodes(catalog).some(node => 'data-icon-create-footer' in node.props));
    assert.deepEqual(nodes(footer).filter(node => node.type === 'button').map(text), ['Cancel', 'Create portal']);
    if (mode === 'web') {
      assert.equal(h.styles.size, 0); assert.equal(h.viewport.listeners.size, 0); assert.equal(h.window.listeners.size, 0);
      assert.deepEqual(h.focusCalls.map(call => call.target), ['field']);
      assert.match(form.props.className, /max-w-\[440px\]/);
      assert.match(form.props.className, /rounded-\[16px\]/);
    } else {
      assert.equal(h.focusCalls.length, 0, 'Opening the mobile screen must not summon the keyboard');
    }
  }
});

test('New portal keeps title and icon drafts, returns focus from icon search and only submits an explicit valid choice', t => {
  for (const mode of ['mobile', 'web']) {
    const h = harness(mode); t.after(() => h.dispose());
    const create = () => nodes(h.footer()).find(node => node.props.type === 'submit');
    assert.equal(create().props.disabled, true); h.submit(); assert.equal(h.calls.length, 0);
    assert.equal(h.field().props.maxLength, 48); h.type('  Astronomy  ');
    assert.equal(create().props.disabled, false);
    h.toggle().props.onClick(); h.render();
    assert.equal(h.field().props.type, 'search'); assert.equal(h.field().props.value, '');
    h.type('telescope'); assert.equal(h.library().props.searchQuery, 'telescope');
    assert.equal(create().props.disabled, true); h.submit(); assert.equal(h.calls.length, 0);
    h.library().props.onSelect('lucide:telescope'); h.render();
    assert.equal(h.field().props.type, 'text'); assert.equal(h.field().props.value, '  Astronomy  ');
    assert.equal(h.library().props.selected, 'lucide:telescope'); assert.equal(h.library().props.searchQuery, '');
    assert.equal(h.focusCalls.at(-1).target, 'toggle'); assert.equal(h.focusCalls.at(-1).options.preventScroll, true);
    assert.equal(h.scrollElement.scrollTop, 0); assert.equal(h.calls.length, 0);
    h.submit(); assert.deepEqual(h.calls, [['Astronomy', 'lucide:telescope']]);
  }
});

test('Escape leaves icon search before cancellation, while saving guards footer, Close, backdrop and submission', t => {
  for (const mode of ['mobile', 'web']) {
    const h = harness(mode); t.after(() => h.dispose());
    h.type('Design'); h.toggle().props.onClick(); h.render(); h.type('camera');
    h.escape(); assert.equal(h.field().props.value, 'Design'); assert.equal(h.calls.length, 0);
    h.escape(); assert.deepEqual(h.calls, ['cancel']); h.calls.length = 0;
    h.setProps({ isSaving: true, error: 'Please try again.' });
    assert.equal(text(h.find(node => node.props.role === 'alert')), 'Please try again.');
    assert.equal(h.field().props.disabled, true); assert.equal(h.toggle().props.disabled, true); assert.equal(h.library().props.disabled, true);
    for (const button of nodes(h.footer()).filter(node => node.type === 'button')) assert.equal(button.props.disabled, true);
    assert.match(text(h.footer()), /Creating…/);
    h.find(node => node.props['aria-label'] === 'Close').props.onClick();
    h.find(node => node.type === 'button' && text(node) === 'Cancel').props.onClick();
    const root = h.find(node => 'data-mobile-icon-create' in node.props);
    root.props.onMouseDown({ target: root, currentTarget: root });
    h.escape(); h.submit(); assert.deepEqual(h.calls, []);
    h.setProps({ isSaving: false });
    root.props.onMouseDown({ target: {}, currentTarget: root }); assert.deepEqual(h.calls, []);
    h.find(node => node.type === 'button' && text(node) === 'Cancel').props.onClick(); assert.deepEqual(h.calls, ['cancel']);
  }
});
