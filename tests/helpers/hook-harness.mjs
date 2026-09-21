import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Executes the real hook with controlled effects, service responses and clock events. */
export function hookHarness(file, exportName, services, auth, initialOptions = {}, profileData = { invalidateProfiles() {} }) {
  const slots = [];
  const intervals = new Map();
  const timeouts = new Map();
  let cursor = 0, dirty = true, result, options = initialOptions, timer = 0;
  let effects = [];
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value) => {
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
    require(name) {
      if (name === 'react') return react;
      if (name.endsWith('/AuthContext')) return { useAuth: () => auth };
      if (name.endsWith('/ProfileDataContext')) return { useProfileData: () => profileData };
      if (name.endsWith('/ServicesContext')) return { useServices: () => services };
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
  return {
    get value() { if (dirty) render(); return result; },
    document,
    async flush() { for (let i = 0; i < 25; i++) { if (dirty) render(); await Promise.resolve(); } return result; },
    tick() { for (const fn of [...intervals.values()]) fn(); },
    runTimeouts() { const pending = [...timeouts.values()]; timeouts.clear(); for (const fn of pending) fn(); },
    options(next) { options = next; dirty = true; },
    rerender() { dirty = true; },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
