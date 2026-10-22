import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred } from './helpers/hook-harness.mjs';

const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const validation = sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
const profileHandle = sourceModule('src/utils/profileHandle.ts', { '../features/sharing/shareModel': shareModel });
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const find = (tree, predicate) => nodes(tree).find(predicate);
const textOf = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(textOf).join('') : String(tree ?? '');

// Execute the actual onboarding component with real validation and an explicit
// effect/timer lifecycle. Availability and profile writes are controlled, so no
// backend requests or wall-clock sleeps are needed.
function harness({ presentation = 'mobile', registration, service = true } = {}) {
  const slots = [], timers = new Map(), requests = [], creations = [], removedDrafts = [], completed = [], completionEvents = [];
  let cursor = 0, dirty = true, tree, effects = [], now = 0, timerId = 0, mounted = true, staleStateWrites = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        if (!mounted) { staleStateWrites++; return; }
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) {
        const prior = slots[i];
        slots[i] = { deps };
        effects.push(() => { prior?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const checker = () => handle => { const response = deferred(); requests.push({ handle, accountId: auth.user.id, ...response }); return response.promise; };
  const auth = { user: { id: 'account-a', isEmailVerified: true, registration } };
  const profiles = { checkPublicHandle: service ? checker() : undefined };
  const avatar = { avatar: null, error: null, select() {}, clear() {} };
  const create = { status: 'idle', isLoading: false, createdProfile: null, run(input) {
    const response = deferred(); creations.push({ input, ...response }); return response.promise;
  } };
  const props = { isOpen: true, theme: 'light', accentColor: '#0A84FF', onAccentColorChange() {}, onDismiss() {}, onComplete(id) { completed.push(id); completionEvents.push(['complete', id]); } };
  const clock = {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const { ProfileOnboardingDialog } = sourceModule('src/features/profile/ProfileOnboardingDialog.tsx', {
    react,
    'lucide-react': { AlertCircleIcon: 'AlertCircleIcon', CheckCircle2Icon: 'CheckCircle2Icon' },
    '../../contexts/ServicesContext': { useServices: () => ({ profiles }) },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../utils/profileHandle': profileHandle,
    '../../components/auth/AccountWelcomeSurface': { AccountWelcomeSurface: 'AccountWelcomeSurface' },
    '../../components/auth/MobileOnboarding': { MobileOnboardingAction: 'MobileOnboardingAction' },
    '../auth/registration': { readRegistrationAvatar: async () => null, removeRegistrationDraft: async id => { removedDrafts.push(id); completionEvents.push(['cleanup', id]); } },
    '../../utils/publicAppearance': { DEFAULT_PUBLIC_APPEARANCE: { accentColor: '#0A84FF', systemGray: 'gray6', mode: 'auto' } },
    '../../components/profile/ProfileField': { ProfileField: 'ProfileField' },
    '../../components/profile/ProfileVisibilityField': { ProfileVisibilityField: 'ProfileVisibilityField' },
    '../../components/profile/ProfileLocationPicker': { ProfileLocationPicker: 'ProfileLocationPicker' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../components/ui/Button': { Button: 'Button' },
    './useProfileOnboarding': { useAvatarSelection: () => avatar, useCreateProfile: () => create },
    './validation': validation,
  }, { ...clock, Error });
  function render() {
    for (let pass = 0; mounted && dirty; pass++) {
      assert.ok(pass < 30, 'Onboarding effects must settle');
      cursor = 0; dirty = false; effects = [];
      tree = ProfileOnboardingDialog(props);
      for (const effect of effects) effect();
    }
    return tree;
  }
  const h = {
    requests, creations, removedDrafts, completed, completionEvents, create,
    render,
    field(id = 'handle') { return find(render(), node => node.props.id === `onboarding-${id}`); },
    status() { return h.field()?.props.status ?? null; },
    form() { return find(render(), node => node.type === 'form'); },
    change(value, id = 'handle') { h.field(id).props.onChange(value); render(); },
    update(next) { Object.assign(props, next); dirty = true; render(); },
    account(id) { auth.user = { ...auth.user, id }; dirty = true; render(); },
    replaceChecker(next = checker()) { profiles.checkPublicHandle = next; dirty = true; render(); },
    async flush() { for (let i = 0; i < 20; i++) { await Promise.resolve(); render(); } },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].callback(); render(); await h.flush();
      }
      now = end; await h.flush();
    },
    dispose() {
      if (!mounted) return;
      for (const slot of slots) slot?.cleanup?.();
      mounted = false;
    },
    get staleStateWrites() { return staleStateWrites; },
    get pendingTimers() { return timers.size; },
  };
  render();
  return h;
}

const fieldReact = { ...React, useRef: initial => ({ current: initial }) };
const { ProfileField } = sourceModule('src/components/profile/ProfileField.tsx', {
  react: fieldReact,
  'lucide-react': { AlertCircleIcon: 'AlertCircleIcon', XIcon: 'XIcon' },
  '../text/TextFormattingToolbar': { TextFormattingToolbar: 'TextFormattingToolbar' },
});
const renderField = field => ProfileField.render(field.props, null);
const submitEvent = () => ({ preventDefault() {} });

test('onboarding availability debounces for 350ms and typing remains editable on both platforms', async t => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness({ presentation }); t.after(() => h.dispose());
    assert.equal(h.status(), null);
    h.change('Maker Name', 'name');
    await h.advance(349);
    assert.equal(h.requests.length, 0);
    h.change('first.handle'); await h.advance(200); h.change('final.handle');
    await h.advance(349); assert.equal(h.requests.length, 0, 'Superseded debounce timers must not check an old name or handle.');
    assert.equal(h.field().props.disabled, false);
    assert.equal(h.status().tone, 'neutral');
    await h.advance(1);
    assert.deepEqual(h.requests.map(request => request.handle), ['final.handle']);
    assert.equal(h.field().props.disabled, false, 'A background check must not lock typing.');
    h.change('next.handle'); assert.equal(h.field().props.value, 'next.handle');
    assert.equal(h.creations.length, 0);
  }
});

test('available and taken feedback reaches the actual accessible ProfileField without changing the handle', async t => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness({ presentation }); t.after(() => h.dispose());
    h.change('Maker', 'name'); h.change('exact.handle'); await h.advance(350);
    let field = renderField(h.field()), input = find(field, node => node.type === 'input');
    assert.equal(field.props['data-field-status'], 'neutral');
    assert.equal(input.props['aria-invalid'], undefined);
    assert.equal(input.props['aria-describedby'], 'onboarding-handle-status');
    h.requests[0].resolve('available'); await h.flush();
    field = renderField(h.field()); input = find(field, node => node.type === 'input');
    const status = find(field, node => node.props.role === 'status');
    assert.equal(field.props['data-field-status'], 'positive');
    assert.equal(input.props['aria-invalid'], undefined);
    assert.equal(status.props.id, input.props['aria-describedby']);
    assert.match(textOf(status), /Available/); assert.ok(find(status, node => node.type === 'CheckCircle2Icon'));
    assert.match(status.props.className, /var\(--status-success\)/);
    h.change('taken.handle'); await h.advance(350); h.requests[1].resolve('taken'); await h.flush();
    field = renderField(h.field()); input = find(field, node => node.type === 'input');
    const negative = find(field, node => node.props.role === 'status');
    assert.equal(field.props['data-field-status'], 'negative'); assert.equal(input.props['aria-invalid'], true);
    assert.equal(input.props.value, 'taken.handle'); assert.match(textOf(negative), /already taken/);
    assert.ok(find(negative, node => node.type === 'AlertCircleIcon')); assert.match(negative.props.className, /var\(--status-danger\)/);
    assert.equal(h.creations.length, 0, 'Availability feedback alone never creates a profile.');
  }
});

test('invalid or reserved visible handles fail locally without automatic suffixes or profile creation', async t => {
  for (const presentation of ['mobile', 'web']) {
    for (const handle of ['ab', 'bad?handle', 'home']) {
      const h = harness({ presentation }); t.after(() => h.dispose());
      h.change('Maker', 'name'); h.change(handle); await h.advance(1000);
      assert.equal(h.status().tone, 'negative'); assert.equal(h.status().message, validation.validateHandle(handle));
      assert.equal(find(renderField(h.field()), node => node.type === 'input').props['aria-invalid'], true);
      await h.form().props.onSubmit(submitEvent()); await h.flush();
      assert.equal(h.field().props.value, handle); assert.equal(h.requests.length, 0); assert.equal(h.creations.length, 0);
      assert.equal(h.render().props.busy, false);
    }
  }
});

test('out-of-order success and failures cannot replace feedback for the currently typed handle', async t => {
  for (const staleFails of [false, true]) {
    const h = harness(); t.after(() => h.dispose());
    h.change('first.handle'); await h.advance(350);
    h.change('second.handle'); await h.advance(350);
    h.requests[1].resolve(staleFails ? 'available' : 'taken'); await h.flush();
    const current = h.status();
    if (staleFails) h.requests[0].reject(new Error('old request failed')); else h.requests[0].resolve('available');
    await h.flush();
    assert.equal(h.field().props.value, 'second.handle'); assert.equal(h.status().tone, current.tone); assert.equal(h.status().message, current.message);
    assert.equal(h.creations.length, 0);
  }
});

test('returning to the same handle creates a fresh scope instead of accepting its old pending result', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.change('alpha.handle'); await h.advance(350);
  h.change('beta.handle'); await h.advance(350);
  h.change('alpha.handle'); await h.advance(350);
  assert.deepEqual(h.requests.map(request => request.handle), ['alpha.handle', 'beta.handle', 'alpha.handle']);
  h.requests[0].resolve('available'); h.requests[1].resolve('taken'); await h.flush();
  assert.equal(h.status().tone, 'neutral', 'The first alpha response does not authorize the later alpha scope.');
  h.requests[2].resolve('taken'); await h.flush();
  assert.equal(h.status().tone, 'negative'); assert.match(h.status().message, /taken/); assert.equal(h.field().props.value, 'alpha.handle');
});

test('account and availability-service identity changes invalidate results for the same handle', async t => {
  for (const changeScope of [h => h.account('account-b'), h => h.replaceChecker()]) {
   for (const settled of [false, true]) {
    const h = harness(); t.after(() => h.dispose());
    h.change('Maker', 'name'); h.change('same.handle'); await h.advance(350);
    if (settled) { h.requests[0].resolve('available'); await h.flush(); assert.equal(h.status().tone, 'positive'); }
    changeScope(h); if (!settled) h.requests[0].resolve('available'); await h.flush();
    assert.equal(h.status().tone, 'neutral'); await h.advance(350);
    assert.equal(h.requests.length, 2); h.requests[1].resolve('taken'); await h.flush();
    assert.equal(h.status().tone, 'negative'); assert.equal(h.creations.length, 0);
   }
  }
});

test('closing and reopening ignores old checks, cancels timers, and checks the new open scope', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.change('same.handle'); await h.advance(350); h.update({ isOpen: false });
  assert.equal(h.render(), null); h.requests[0].resolve('available'); await h.flush();
  await h.advance(1000); assert.equal(h.requests.length, 1);
  h.update({ isOpen: true }); assert.equal(h.status().tone, 'neutral');
  await h.advance(350); assert.equal(h.requests.length, 2);
  h.requests[1].resolve('taken'); await h.flush(); assert.equal(h.status().tone, 'negative');
  h.change('cancel.timer'); assert.equal(h.pendingTimers, 1);
  h.update({ isOpen: false }); assert.equal(h.pendingTimers, 0); await h.advance(350); assert.equal(h.requests.length, 2);
});

test('unmount cancels debounce and ignores pending background or submit continuations', async () => {
  for (const mode of ['debounce', 'background', 'submit']) {
    const h = harness(); h.change('Maker', 'name'); h.change('unmounted.handle');
    let pending;
    if (mode === 'background') await h.advance(350);
    if (mode === 'submit') { pending = h.form().props.onSubmit(submitEvent()); await h.flush(); }
    h.dispose(); assert.equal(h.pendingTimers, 0);
    for (const request of h.requests) request.resolve('available');
    await h.flush(); if (pending) await pending;
    assert.equal(h.staleStateWrites, 0); assert.equal(h.creations.length, 0);
  }
});

test('one immediate Continue cancels the debounce and creates once without a delayed duplicate lookup', async t => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness({ presentation }); t.after(() => h.dispose());
    h.change('Maker', 'name'); h.change('@Exact.Handle'); h.change('  A custom place  ', 'location');
    const submit = h.form().props.onSubmit;
    const pending = submit(submitEvent()); await submit(submitEvent()); await h.flush();
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].handle, 'exact.handle');
    assert.equal(h.pendingTimers, 0, 'Explicit Continue cancels the scheduled advisory lookup.');
    assert.equal(h.render().props.busy, true); assert.equal(h.field().props.disabled, true);
    await h.advance(350); assert.equal(h.requests.length, 1, 'No delayed duplicate lookup starts after Continue.');
    h.requests[0].resolve('available'); await h.flush();
    assert.equal(h.creations.length, 1); assert.equal(h.creations[0].input.name, 'Maker');
    assert.equal(h.creations[0].input.handle, 'exact.handle'); assert.equal(h.creations[0].input.location, 'A custom place');
    assert.equal(h.creations[0].input.avatar, undefined);
    await h.form().props.onSubmit(submitEvent()); assert.equal(h.creations.length, 1);
    h.creations[0].resolve(); await pending; await h.flush(); assert.equal(h.render().props.busy, false);
  }
});

test('Continue reuses a background lookup, while a changed account or close cannot create from its result', async t => {
  for (const outcome of ['create', 'account', 'close']) {
    const h = harness(); t.after(() => h.dispose());
    h.change('Maker', 'name'); h.change('pending.handle'); await h.advance(350);
    const pending = h.form().props.onSubmit(submitEvent()); await h.flush(); assert.equal(h.requests.length, 1);
    if (outcome === 'account') h.account('other-account');
    if (outcome === 'close') h.update({ isOpen: false });
    h.requests[0].resolve('available'); await h.flush();
    assert.equal(h.creations.length, outcome === 'create' ? 1 : 0);
    if (outcome === 'create') h.creations[0].resolve();
    await pending;
  }
});

test('completed available checks are reused on Continue and on retry after a refused profile write', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.change('Maker', 'name'); h.change('available.handle'); await h.advance(350);
  h.requests[0].resolve('available'); await h.flush();
  const failed = h.form().props.onSubmit(submitEvent()); await h.flush();
  assert.equal(h.requests.length, 1); assert.equal(h.creations.length, 1);
  h.creations[0].reject(new Error('write refused')); await assert.rejects(failed, /write refused/); await h.flush();
  h.create.status = 'error'; h.create.error = 'Try again'; h.update({});
  assert.equal(h.render().props.busy, false);
  const retry = h.form().props.onSubmit(submitEvent()); await h.flush();
  assert.equal(h.requests.length, 1); assert.equal(h.creations.length, 2); assert.equal(h.creations[1].input.handle, 'available.handle');
  h.creations[1].resolve(); await retry;
});

test('taken, unavailable, rejected and missing checks fail closed and allow explicit retry without rewriting text', async t => {
  for (const outcome of ['taken', 'unavailable', 'rejected', 'missing']) {
    const h = harness({ service: outcome !== 'missing' }); t.after(() => h.dispose());
    h.change('Maker', 'name'); h.change('keep.this.handle');
    const pending = h.form().props.onSubmit(submitEvent()); await h.flush();
    if (outcome !== 'missing') {
      if (outcome === 'rejected') h.requests[0].reject(new Error('network failed'));
      else h.requests[0].resolve(outcome);
    }
    await pending; await h.flush();
    assert.equal(h.status().tone, 'negative'); assert.equal(h.field().props.value, 'keep.this.handle');
    assert.match(h.status().message, outcome === 'taken' ? /already taken/ : /Could not check availability/);
    assert.equal(h.creations.length, 0); assert.equal(h.render().props.busy, false);
    if (outcome === 'missing') h.replaceChecker();
    const retry = h.form().props.onSubmit(submitEvent()); await h.flush();
    const request = h.requests.at(-1); assert.ok(request); request.resolve('available'); await h.flush();
    assert.equal(h.creations.length, 1); assert.equal(h.creations[0].input.handle, 'keep.this.handle');
    h.creations[0].resolve(); await retry;
  }
});

test('trusted saved registration still resumes once with its handle and creation key without advisory lookups', async t => {
  for (const presentation of ['mobile', 'web']) {
    const registration = { id: 'saved-registration', name: 'Saved Maker', handle: 'saved.handle', location: 'Saved place', accentColor: '#FF375F', hasAvatar: false, isPrivate: true };
    const h = harness({ presentation, registration }); t.after(() => h.dispose());
    await h.flush(); await h.advance(1000);
    assert.equal(h.requests.length, 0); assert.equal(h.creations.length, 1);
    assert.equal(h.creations[0].input.handle, registration.handle); assert.equal(h.creations[0].input.creationKey, registration.id);
    assert.equal(h.creations[0].input.isPrivate, true); assert.equal(h.creations[0].input.location, registration.location);
    assert.equal(h.creations[0].input.publicAppearance.accentColor, registration.accentColor);
    assert.equal(h.status(), null); h.creations[0].resolve(); await h.flush();
  }
});

test('ordinary profile save completes directly once on both platforms while failure retains the editable form', async t => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness({ presentation }); t.after(() => h.dispose());
    h.change('Maker', 'name'); h.change('maker.handle');
    assert.deepEqual(h.completed, []); assert.ok(h.form());
    const first = h.form().props.onSubmit(submitEvent()); await h.flush();
    assert.deepEqual(h.completed, [], 'Checking a handle must not complete profile setup.');
    h.requests[0].resolve('available'); await h.flush();
    assert.equal(h.creations.length, 1); assert.deepEqual(h.completed, [], 'A pending profile write must not advance onboarding.');
    h.create.status = 'error'; h.create.error = 'Profile could not be saved'; h.creations[0].resolve(); await first; h.update({});
    assert.deepEqual(h.completed, []); assert.ok(h.form());
    assert.match(textOf(find(h.render(), node => node.props.role === 'alert')), /Profile could not be saved/);
    assert.equal(h.field().props.value, 'maker.handle'); assert.equal(h.field().props.disabled, false);
    const retry = h.form().props.onSubmit(submitEvent()); await h.flush();
    assert.equal(h.creations.length, 2); assert.deepEqual(h.completed, []);
    h.creations[1].resolve(); await retry;
    h.create.status = 'success'; h.create.createdProfile = { id: 'saved-profile', name: 'Maker' }; h.update({});
    assert.deepEqual(h.completed, ['saved-profile']); assert.equal(h.render(), null);
    h.update({ onComplete: id => h.completed.push(`repeated:${id}`) });
    h.create.createdProfile = { ...h.create.createdProfile }; h.update({});
    assert.deepEqual(h.completed, ['saved-profile'], 'Renders and callback/profile identity changes must not advance twice.');
    assert.deepEqual(h.removedDrafts, []);
  }
});

test('saved WEB registration invokes draft cleanup before its one-shot completion without a success card', async t => {
  const registration = { id: 'saved-registration', name: 'Saved Maker', handle: 'saved.handle', location: 'Saved place', accentColor: '#FF375F', hasAvatar: false };
  const h = harness({ presentation: 'web', registration }); t.after(() => h.dispose());
  await h.flush();
  assert.equal(h.creations.length, 1); assert.deepEqual(h.completionEvents, []);
  h.creations[0].resolve(); await h.flush();
  h.create.status = 'success'; h.create.createdProfile = { id: 'restored-profile', name: registration.name }; h.update({});
  assert.equal(h.render(), null);
  assert.deepEqual(h.completionEvents, [['cleanup', registration.id], ['complete', 'restored-profile']]);
  h.update({}); h.create.createdProfile = { ...h.create.createdProfile }; h.update({});
  assert.deepEqual(h.removedDrafts, [registration.id]); assert.deepEqual(h.completed, ['restored-profile']);
});
