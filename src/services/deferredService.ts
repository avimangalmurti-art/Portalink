/** Keep service contracts stable while loading an implementation only on use.
 * These delegates are for Promise-returning methods; synchronous capabilities
 * and subscriptions must be supplied directly or kept outside this entry. */
export function deferredService<T extends object>(load: () => Promise<T>, overrides: Partial<T> = {}): T {
  let pending: Promise<T> | undefined;
  const methods = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  return new Proxy(overrides as T, {
    get(target, key, receiver) {
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
      // A registry must not accidentally become thenable when inspected or awaited.
      if (typeof key !== 'string' || key === 'then') return undefined;
      let method = methods.get(key);
      if (!method) {
        method = async (...args: unknown[]) => {
          pending ??= load().catch(error => { pending = undefined; throw error; });
          const service = await pending;
          const invoke = Reflect.get(service, key);
          if (typeof invoke !== 'function') throw new Error(`The service does not provide ${key}.`);
          return Reflect.apply(invoke, service, args);
        };
        methods.set(key, method);
      }
      return method;
    },
  });
}

/** Visitor navigation hands these destinations to the full application. Never
 * import its registry or pretend an unavailable operation completed. */
export function unavailableVisitorService<T extends object>(destination: string): T {
  return new Proxy({} as T, {
    get(_target, key) {
      if (typeof key !== 'string' || key === 'then') return undefined;
      return () => { throw new Error(`Open ${destination} in Portalink to use this action.`); };
    },
  });
}
