import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
function storageFixture() {
  const entries = new Map();
  let failWrite = false, failRemove = false;
  const localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) { if (failWrite) throw Error('quota'); entries.set(key, value); },
    removeItem(key) { if (failRemove) throw Error('blocked'); entries.delete(key); },
  };
  return {
    entries,
    api: sourceModule('src/features/publishing/setupDraft.ts', {}, { window: { localStorage } }),
    failWrite(value) { failWrite = value; }, failRemove(value) { failRemove = value; },
  };
}
const setup = { title: '  Quiet rooms ', summary: 'My unfinished story\nwith a second line.', portal: 'new', name: 'Photography' };

test('setup recovery preserves exact text and portal choice while isolating account and profile', () => {
  const { api } = storageFixture();
  api.saveSetupDraft('account', 'profile', setup);
  assert.equal(JSON.stringify(api.readSetupDraft('account', 'profile')), JSON.stringify(setup));
  assert.equal(api.readSetupDraft('other', 'profile'), null);
  assert.equal(api.readSetupDraft('account', 'other'), null);
  api.saveSetupDraft('account:profile', 'a', setup);
  assert.equal(api.readSetupDraft('account', 'profile:a'), null);
  api.clearSetupDraft('account', 'profile');
  assert.equal(api.readSetupDraft('account', 'profile'), null);
  assert.equal(api.readSetupDraft('account:profile', 'a').title, setup.title);
});

test('unreadable, unavailable and failed storage never silently delete the saved setup', () => {
  const h = storageFixture(); h.api.saveSetupDraft('account', 'profile', setup);
  const key = [...h.entries.keys()][0];
  h.failWrite(true);
  assert.throws(() => h.api.saveSetupDraft('account', 'profile', { ...setup, title: 'Replacement' }), /could not be saved/);
  assert.equal(h.api.readSetupDraft('account', 'profile').title, setup.title);
  h.failRemove(true);
  assert.throws(() => h.api.clearSetupDraft('account', 'profile'), /could not be cleared/);
  assert.equal(h.api.readSetupDraft('account', 'profile').title, setup.title);
  h.entries.set(key, '{broken');
  assert.throws(() => h.api.readSetupDraft('account', 'profile'), /could not be opened/);
  assert.equal(h.entries.get(key), '{broken');
  const absent = sourceModule('src/features/publishing/setupDraft.ts');
  assert.throws(() => absent.readSetupDraft('account', 'profile'), /could not be saved/);
});

function harness(storage, extraProps = {}) {
  const slots = [], effects = [], calls = [];
  let cursor = 0;
  const react = {
    ...React,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(effect, dependencies) {
      const i = cursor++, previous = slots[i];
      if (!previous || !dependencies || dependencies.some((value, index) => value !== previous.dependencies[index])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { dependencies, cleanup: effect() }; });
      }
    },
  };
  const { ProjectSetupScreen } = sourceModule('src/features/publishing/ProjectSetupScreen.tsx', {
    react,
    'lucide-react': { PlusIcon: 'plus', UsersIcon: 'users', XIcon: 'close' },
    '../../components/profile/categoryIcons': { getCategoryIcon: () => 'portal-icon' },
    '../../components/ui/ModalPortal': { ModalPortal: 'portal' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../components/publishing/useAuthoringFocus': { useAuthoringFocus() {} },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    './validation': { validateTitle: value => value.trim() ? null : 'Add a title.', TITLE_MAX_LENGTH: 80 },
    '../profile/useCategoryManagement': { validateCategoryLabel: () => null, MAX_CATEGORY_LABEL: 80 },
    './setupDraft': storage.api,
    './projectSetup.css': {},
  });
  const props = {
    accountId: 'account', profileId: 'profile', categories: [{ id: 'design', label: 'Design' }],
    onCreatePortal: async name => { calls.push(['create', name]); return { id: 'created', label: name }; },
    onContinue: value => calls.push(['continue', value]), onClose: () => calls.push(['close']),
    onResumeDraft: draft => calls.push(['resume', draft]), ...extraProps,
  };
  const render = () => { cursor = 0; const tree = ProjectSetupScreen(props); effects.splice(0).forEach(effect => effect()); return nodes(tree); };
  const change = (name, value) => {
    const field = render().find(node => node.props.name === name || node.props['aria-label'] === name || name === 'summary' && node.type === 'textarea');
    assert.ok(field, name); field.props.onChange({ target: { value } });
  };
  return {
    render, change, calls,
    click(label) { const button = render().find(node => node.type === 'button' && (node.props.children === label || node.props['aria-label'] === label)); assert.ok(button, label); return button.props.onClick(); },
    submit() { render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
  };
}

test('a fresh setup is saved as fields change and restores on same-device reopen without backend writes', () => {
  const storage = storageFixture(), first = harness(storage);
  first.render(); assert.equal(storage.entries.size, 0);
  first.change('title', setup.title); first.change('summary', setup.summary); first.change('Portal', 'new'); first.change('New portal name', setup.name);
  first.click('Cancel new idea');
  assert.deepEqual(first.calls, [['close']]);
  const reopened = harness(storage), all = reopened.render();
  assert.equal(all.find(node => node.props.name === 'title').props.value, setup.title);
  assert.equal(all.find(node => node.type === 'textarea').props.value, setup.summary);
  assert.equal(all.find(node => node.props['aria-label'] === 'Portal').props.value, 'new');
  assert.equal(all.find(node => node.props['aria-label'] === 'New portal name').props.value, setup.name);
  assert.ok(all.some(node => node.type === 'button' && node.props.children === 'Start fresh'));
  assert.equal(reopened.calls.length, 0);
});

test('Continue retains setup until the publisher explicitly clears it', async () => {
  const storage = storageFixture(), h = harness(storage);
  h.change('title', 'Project'); h.change('summary', 'Description'); h.submit();
  await new Promise(setImmediate);
  assert.equal(h.calls.at(-1)[0], 'continue');
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, 'Project');
  storage.api.clearSetupDraft('account', 'profile');
  assert.equal(storage.api.readSetupDraft('account', 'profile'), null);
});

test('clearing authored text also saves the cleared values rather than resurrecting the earlier text', () => {
  const storage = storageFixture(), h = harness(storage);
  h.change('title', 'Old title'); h.render();
  h.change('title', ''); h.click('Cancel new idea');
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, '');
  assert.equal(harness(storage).render().find(node => node.props.name === 'title').props.value, '');
});

test('save failure keeps close open and fresh-action failure preserves restored fields', () => {
  const storage = storageFixture(); storage.api.saveSetupDraft('account', 'profile', setup);
  const h = harness(storage); h.render(); storage.failWrite(true);
  h.change('title', 'Edited title'); h.click('Cancel new idea');
  assert.equal(h.calls.length, 0);
  assert.ok(h.render().some(node => node.props.role === 'alert' && /could not be saved/.test(node.props.children)));
  storage.failRemove(true); h.click('Start fresh');
  assert.equal(h.render().find(node => node.props.name === 'title').props.value, 'Edited title');
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, setup.title);
  storage.failWrite(false); storage.failRemove(false); h.click('Start fresh');
  assert.equal(h.render().find(node => node.props.name === 'title').props.value, '');
  assert.equal(storage.api.readSetupDraft('account', 'profile'), null);
});

test('existing draft and committed-project actions delegate only after an explicit tap', () => {
  for (const committed of [undefined, { projectId: 'published' }]) {
    const draft = { id: 'draft', profileId: 'profile', categoryId: 'design' };
    const h = harness(storageFixture(), { recoveryDraft: { draft, metadata: { title: 'Saved project', summary: '' }, committed } });
    const label = committed ? 'Finish published idea' : 'Continue draft';
    assert.ok(h.render().some(node => node.type === 'button' && node.props.children === label));
    assert.equal(h.calls.length, 0); h.click(label);
    assert.deepEqual(h.calls, [['resume', draft]]);
  }
});

test('removed saved portal stays explicit until the creator chooses another', () => {
  const storage = storageFixture(); storage.api.saveSetupDraft('account', 'profile', { ...setup, portal: 'removed' });
  const h = harness(storage), all = h.render();
  assert.equal(all.find(node => node.props['aria-label'] === 'Portal').props.value, 'removed');
  assert.ok(all.some(node => node.type === 'option' && node.props.value === 'removed' && node.props.disabled));
});

test('upload recovery-check failure is separate from setup storage and leaves restored fields available', () => {
  const storage = storageFixture(); storage.api.saveSetupDraft('account', 'profile', setup);
  const message = 'Saved upload drafts could not be checked. Close and reopen New project to try again.';
  const h = harness(storage, { recoveryError: message }), all = h.render();
  assert.ok(all.some(node => node.props.role === 'alert' && node.props.children === 'Saved upload drafts could not be checked. Close and reopen New idea to try again.'));
  assert.equal(all.find(node => node.props.name === 'title').props.value, setup.title);
  assert.equal(all.find(node => node.type === 'textarea').props.value, setup.summary);
  h.change('title', 'Still editable'); h.render();
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, 'Still editable');
  assert.equal(h.calls.length, 0);
});
