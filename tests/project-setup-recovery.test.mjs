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

test('legacy version-one drafts keep their original shape while optional icon IDs round-trip', () => {
  const { api, entries } = storageFixture();
  api.saveSetupDraft('account', 'profile', setup);
  const key = [...entries.keys()][0];
  assert.equal(entries.get(key), JSON.stringify({ ...setup, version: 1 }));
  assert.equal(JSON.stringify(api.readSetupDraft('account', 'profile')), JSON.stringify(setup));
  assert.equal(Object.hasOwn(api.readSetupDraft('account', 'profile'), 'iconName'), false);
  for (const iconName of ['shapes', 'camera', 'lucide:telescope']) {
    api.saveSetupDraft('account', 'profile', { ...setup, iconName });
    assert.equal(JSON.stringify(api.readSetupDraft('account', 'profile')), JSON.stringify({ ...setup, iconName }));
    assert.equal(api.readSetupDraft('other', 'profile'), null);
    assert.equal(api.readSetupDraft('account', 'other'), null);
  }
});

test('malformed optional icons never discard valid authored version-one details', () => {
  const { api, entries } = storageFixture();
  api.saveSetupDraft('account', 'profile', setup);
  const key = [...entries.keys()][0];
  for (const iconName of [null, false, 42, {}, [], '', ' camera ', 'CameraIcon', 'lucide:', 'lucide:../camera', '<svg>', 'a'.repeat(97)]) {
    entries.set(key, JSON.stringify({ ...setup, iconName, version: 1 }));
    assert.equal(JSON.stringify(api.readSetupDraft('account', 'profile')), JSON.stringify(setup));
    api.saveSetupDraft('account', 'profile', { ...setup, iconName });
    assert.equal(JSON.stringify(api.readSetupDraft('account', 'profile')), JSON.stringify(setup));
    assert.equal(Object.hasOwn(JSON.parse(entries.get(key)), 'iconName'), false);
  }
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
  const { presentation = 'mobile', ...componentProps } = extraProps;
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
    'lucide-react': { CheckIcon: 'check', PlusIcon: 'plus', XIcon: 'close' },
    '../../components/profile/categoryIcons': { portalIconNames: ['shapes', 'camera', 'lucide:telescope'] },
    '../../components/profile/NewCategoryDialog': { NewCategoryDialog: 'new-category-dialog' },
    '../../components/ui/ModalPortal': { ModalPortal: 'portal' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../components/publishing/useAuthoringFocus': { useAuthoringFocus() {} },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    './validation': { validateTitle: value => value.trim() ? null : 'Add a title.', TITLE_MAX_LENGTH: 80 },
    '../profile/useCategoryManagement': { validateCategoryLabel: () => null, MAX_CATEGORY_LABEL: 80 },
    './setupDraft': storage.api,
    './projectSetup.css': {},
  });
  const props = {
    accountId: 'account', profileId: 'profile', categories: [{ id: 'design', label: 'Design' }],
    onCreatePortal: async (name, iconName) => { calls.push(['create', name, iconName]); return { id: 'created', label: name, iconName }; },
    onContinue: value => calls.push(['continue', value]), onClose: () => calls.push(['close']),
    onResumeDraft: draft => calls.push(['resume', draft]), ...componentProps,
  };
  const render = () => { cursor = 0; const tree = ProjectSetupScreen(props); effects.splice(0).forEach(effect => effect()); return nodes(tree); };
  const change = (name, value) => {
    const field = render().find(node => node.props.name === name || node.props['aria-label'] === name || name === 'summary' && node.type === 'textarea');
    assert.ok(field, name); field.props.onChange({ target: { value } });
  };
  return {
    render, change, calls,
    click(label) { const button = render().find(node => node.type === 'button' && (node.props.children === label || node.props['aria-label'] === label)); assert.ok(button, label); return button.props.onClick(); },
    openNewPortal() { this.click(presentation === 'mobile' ? 'New Portal' : 'Create a Portal'); return this.dialog(); },
    dialog() { return render().find(node => node.type === 'new-category-dialog'); },
    submit() { render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
  };
}

test('a fresh setup is saved as fields change and restores on same-device reopen without backend writes', () => {
  const storage = storageFixture(), first = harness(storage);
  first.render(); assert.equal(storage.entries.size, 0);
  first.change('title', setup.title); first.change('summary', setup.summary);
  first.click('Cancel new project');
  assert.deepEqual(first.calls, [['close']]);
  const reopened = harness(storage), all = reopened.render();
  assert.equal(all.find(node => node.props.name === 'title').props.value, setup.title);
  assert.equal(all.find(node => node.type === 'textarea').props.value, setup.summary);
  assert.equal(all.find(node => node.type === 'button' && node.props.value === 'design').props['aria-pressed'], true);
  assert.equal(reopened.dialog(), undefined);
  assert.equal(all.some(node => node.type === 'button' && node.props.children === 'Start fresh'), false);
  assert.equal(all.some(node => ['project-setup-recovered', 'project-setup-save-status', 'project-setup-hint'].includes(node.props.className)), false);
  assert.equal(reopened.calls.length, 0);
});

test('an interrupted canonical Portal draft restores its name and icon when manually reopened', () => {
  for (const presentation of ['mobile', 'web']) {
    const storage = storageFixture(), first = harness(storage, { categories: [], presentation });
    first.change('title', setup.title); first.change('summary', setup.summary);
    first.openNewPortal().props.onDraftChange(setup.name, 'lucide:telescope');
    first.render();
    const saved = storage.api.readSetupDraft('account', 'profile');
    assert.equal(saved.creatingPortal, true);
    assert.equal(saved.name, setup.name);
    assert.equal(saved.iconName, 'lucide:telescope');
    assert.equal(saved.portal, 'new');
    assert.deepEqual(first.calls, [], 'Editing the draft does not create a Portal');
    const reopened = harness(storage, { categories: [], presentation }), all = reopened.render();
    assert.equal(reopened.dialog(), undefined);
    assert.equal(all.find(node => node.props.name === 'title').props.value, setup.title);
    assert.equal(all.find(node => node.type === 'textarea').props.value, setup.summary);
    const dialog = reopened.openNewPortal();
    assert.equal(dialog.props.initialLabel, setup.name);
    assert.equal(dialog.props.initialIconName, 'lucide:telescope');
    dialog.props.onCancel();
    reopened.render();
    const afterCancel = storage.api.readSetupDraft('account', 'profile');
    assert.equal(Boolean(afterCancel.creatingPortal), false);
    assert.equal(afterCancel.title, setup.title);
    assert.equal(afterCancel.summary, setup.summary);
    assert.equal(afterCancel.portal, 'new');
    assert.deepEqual(reopened.calls, []);
  }
});

test('an icon-only choice is saved and restores without creating a Portal or exposing a reset action', () => {
  for (const presentation of ['mobile', 'web']) {
    const storage = storageFixture(), first = harness(storage, { categories: [], presentation });
    first.render(); assert.equal(storage.entries.size, 0);
    first.openNewPortal().props.onDraftChange('', 'camera');
    first.render();
    const saved = storage.api.readSetupDraft('account', 'profile');
    assert.deepEqual([saved.title,saved.summary,saved.portal,saved.name,saved.iconName,saved.creatingPortal], ['', '', 'new', '', 'camera', true]);
    const reopened = harness(storage, { categories: [], presentation });
    const all = reopened.render();
    assert.equal(all.some(node => node.type === 'button' && node.props.children === 'Start fresh'), false);
    assert.equal(reopened.dialog(), undefined);
    assert.equal(reopened.openNewPortal().props.initialIconName, 'camera');
    assert.equal(storage.api.readSetupDraft('account', 'profile').iconName, 'camera');
    assert.equal(reopened.calls.length, 0);
  }
});

test('legacy Portal drafts open manually with the saved name and an available or default icon', () => {
  for (const [draft, iconName] of [[setup,'shapes'],[{ ...setup, iconName: 'lucide:missing-catalog-icon' },'shapes'],[{ ...setup, iconName: 'camera' },'camera']]) {
    const storage = storageFixture(); storage.api.saveSetupDraft('account', 'profile', draft);
    const h = harness(storage), all = h.render();
    assert.equal(all.find(node => node.props.name === 'title').props.value, setup.title);
    assert.equal(all.find(node => node.type === 'textarea').props.value, setup.summary);
    assert.equal(h.dialog(), undefined);
    const dialog = h.openNewPortal();
    assert.equal(dialog.props.initialLabel, setup.name);
    assert.equal(dialog.props.initialIconName, iconName);
    assert.equal(h.calls.length, 0);
  }
});

test('Continue retains setup until the publisher explicitly clears it', async () => {
  const storage = storageFixture(), h = harness(storage);
  h.change('title', 'Project'); h.change('summary', 'Description');
  h.openNewPortal().props.onDraftChange('Photography', 'camera');
  await h.dialog().props.onCreate('Photography', 'camera');
  assert.deepEqual(h.calls, [['create','Photography','camera']]);
  assert.equal(h.dialog(), undefined);
  const saved = storage.api.readSetupDraft('account', 'profile');
  assert.equal(saved.portal, 'created');
  assert.equal(saved.title, 'Project');
  assert.equal(saved.summary, 'Description');
  assert.equal(saved.name, '');
  assert.equal(saved.iconName, 'shapes');
  assert.equal(Boolean(saved.creatingPortal), false);
  h.submit();
  await new Promise(setImmediate);
  assert.equal(h.calls.at(-1)[0], 'continue');
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, 'Project');
  storage.api.clearSetupDraft('account', 'profile');
  assert.equal(storage.api.readSetupDraft('account', 'profile'), null);
});

test('clearing authored text also saves the cleared values rather than resurrecting the earlier text', () => {
  const storage = storageFixture(), h = harness(storage);
  h.change('title', 'Old title'); h.render();
  h.change('title', ''); h.click('Cancel new project');
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, '');
  assert.equal(harness(storage).render().find(node => node.props.name === 'title').props.value, '');
});

test('save failure keeps close open and restored fields available until storage recovers', () => {
  const storage = storageFixture(); storage.api.saveSetupDraft('account', 'profile', setup);
  const h = harness(storage); h.render(); storage.failWrite(true);
  h.change('title', 'Edited title'); h.click('Cancel new project');
  assert.equal(h.calls.length, 0);
  assert.ok(h.render().some(node => node.props.role === 'alert' && /could not be saved/.test(node.props.children)));
  assert.equal(h.render().find(node => node.props.name === 'title').props.value, 'Edited title');
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, setup.title);
  storage.failWrite(false); h.click('Cancel new project');
  assert.deepEqual(h.calls, [['close']]);
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, 'Edited title');
});

test('existing draft and committed-project actions delegate only after an explicit tap', () => {
  for (const committed of [undefined, { projectId: 'published' }]) {
    const draft = { id: 'draft', profileId: 'profile', categoryId: 'design' };
    const h = harness(storageFixture(), { recoveryDraft: { draft, metadata: { title: 'Saved project', summary: '' }, committed } });
    const label = committed ? 'Finish published project' : 'Continue draft';
    assert.ok(h.render().some(node => node.type === 'button' && node.props.children === label));
    assert.equal(h.calls.length, 0); h.click(label);
    assert.deepEqual(h.calls, [['resume', draft]]);
  }
});

test('removed saved Portal stays explicit until the creator chooses another', () => {
 for (const presentation of ['mobile', 'web']) {
  for (const categories of [[], [{id:'design',label:'Design'}]]) {
   const storage = storageFixture();
   storage.api.saveSetupDraft('account', 'profile', { ...setup, portal: 'removed' });
   const h = harness(storage, { categories, presentation }), all = h.render();
   assert.equal(h.calls.length, 0);
   if (presentation === 'mobile') {
    assert.ok(all.some(node => node.props.children === 'Portal unavailable. Choose a Portal.'));
    assert.equal(all.find(node => node.type === 'footer').props.hidden, true);
    h.click('Portals');
    const choices = nodes(h.render().find(node => node.props.id === 'project-setup-portal-list'));
    assert.equal(choices.some(node => node.props['aria-pressed']), false);
    if (categories.length) {
     choices.find(node => node.type === 'button' && node.props.value === 'design').props.onClick();
     assert.equal(h.render().find(node => node.type === 'footer').props.hidden, false);
     assert.equal(storage.api.readSetupDraft('account', 'profile').portal, 'design');
    } else {
     assert.ok(choices.some(node => node.props.children === 'No portals yet.'));
    }
    const dialog = h.openNewPortal();
    assert.equal(dialog.props.itemName, 'portal');
    dialog.props.onCancel();
   } else {
    assert.equal(all.find(node => node.props['aria-label'] === 'Portal').props.value, 'removed');
    assert.ok(all.some(node => node.type === 'option' && node.props.value === 'removed' && node.props.disabled));
    h.change('Portal', 'new');
    const dialog = h.dialog();
    assert.equal(dialog.props.itemName, 'portal');
    dialog.props.onCancel();
    assert.equal(h.render().find(node => node.props['aria-label'] === 'Portal').props.value, 'removed');
   }
   const changed = h.render();
   assert.equal(changed.find(node => node.props.name === 'title').props.value, setup.title);
   assert.equal(changed.find(node => node.type === 'textarea').props.value, setup.summary);
   assert.equal(h.dialog(), undefined);
   assert.equal(h.calls.length, 0);
  }
 }
});

test('upload recovery-check failure is separate from setup storage and leaves restored fields available', () => {
  const storage = storageFixture(); storage.api.saveSetupDraft('account', 'profile', setup);
  const message = 'Saved upload drafts could not be checked. Close and reopen New project to try again.';
  const h = harness(storage, { recoveryError: message }), all = h.render();
  assert.ok(all.some(node => node.props.role === 'alert' && node.props.children === 'Saved upload drafts could not be checked. Close and reopen New project to try again.'));
  assert.equal(all.find(node => node.props.name === 'title').props.value, setup.title);
  assert.equal(all.find(node => node.type === 'textarea').props.value, setup.summary);
  h.change('title', 'Still editable'); h.render();
  assert.equal(storage.api.readSetupDraft('account', 'profile').title, 'Still editable');
  assert.equal(h.calls.length, 0);
});
