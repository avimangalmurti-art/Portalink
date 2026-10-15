import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Executes the real hook with controlled effects, service responses and clock events. */
export function hookHarness(file, exportName, services, auth, initialOptions = {}, profileData = { invalidateProfiles() {}, scope: {} }, dependencies = {}, globals = {}) {
  const slots = [];
  const intervals = new Map();
  const timeouts = new Map();
  let cursor = 0, dirty = true, result, options = initialOptions, timer = 0, generation = 0, mounted = true;
  let effects = [];
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      const mount = generation;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
        if (!mounted || mount !== generation) return;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const prior = slots[index];
        slots[index] = { deps };
        effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, crypto, URL, Error, console, document,
    window: {
      setInterval(fn) { intervals.set(++timer, fn); return timer; },
      clearInterval(id) { intervals.delete(id); },
      setTimeout(fn) { timeouts.set(++timer, fn); return timer; },
      clearTimeout(id) { timeouts.delete(id); },
    },
    ...globals,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.endsWith('/engagement/capabilities')) { const nested = {}; vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/features/engagement/capabilities.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:nested}); return nested; }
      if (name.endsWith('/sharing/InternalContentShare')) return { useInternalContentShare: () => () => { throw new Error('Unexpected share in media state fixture'); } };
      if (name === 'react') return react;
      if (name.endsWith('/AuthContext')) return { useAuth: () => auth };
      if (name.endsWith('/ProfileDataContext')) return { useProfileData: () => profileData };
      if (name.endsWith('/ServicesContext')) return { useServices: () => services };
      if (name.endsWith('/accountQueryCache')) {
        const nested = {};
        vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/features/library/accountQueryCache.ts', import.meta.url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText, { exports: nested });
        return nested;
      }
      if (name.endsWith('/useAsyncAction') || name.endsWith('/types/auth') || name.endsWith('/types/profile') || name.endsWith('/useSavedChangeHistory') || name === './validation') {
        const nested = {};
        const path = name === './validation' ? '../../src/features/profile/validation.ts' : name.endsWith('/useAsyncAction') ? '../../src/hooks/useAsyncAction.ts' : name.endsWith('/useSavedChangeHistory') ? '../../src/hooks/useSavedChangeHistory.ts' : name.endsWith('/types/profile') ? '../../src/types/profile.ts' : '../../src/types/auth.ts';
        vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText, { exports: nested, require: () => react });
        return nested;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const render = () => {
    cursor = 0; dirty = false; effects = [];
    result = exports[exportName](...(Array.isArray(options) ? options : [options]));
    for (const effect of effects) effect();
    return result;
  };
  const dispose = () => {
    for (const slot of slots) {
      slot?.cleanup?.();
      if (slot) delete slot.cleanup;
    }
    mounted = false;
    generation += 1;
  };
  return {
    get value() { if (dirty) render(); return result; },
    document,
    async flush() { for (let i = 0; i < 25; i++) { if (dirty) render(); await Promise.resolve(); } return result; },
    tick() { for (const fn of [...intervals.values()]) fn(); },
    runTimeouts() { const pending = [...timeouts.values()]; timeouts.clear(); for (const fn of pending) fn(); },
    options(next) { options = next; dirty = true; },
    rerender() { dirty = true; },
    // Reuse module-level caches while replacing the component's hook lifecycle.
    // Old state setters cannot write into a newly mounted instance's slots.
    remount(next = options) {
      dispose(); slots.length = 0; effects = []; result = undefined;
      options = next; mounted = true; dirty = true;
    },
    dispose,
  };
}
