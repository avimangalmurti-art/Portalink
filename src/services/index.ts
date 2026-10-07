// Vite selects the durable-only entry for production builds. The synchronous
// registry contract stays unchanged for ServicesContext and injected test APIs.
export { services } from './runtimeServices';
export type { Services } from './interfaces';
