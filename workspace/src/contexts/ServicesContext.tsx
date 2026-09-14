import React, { createContext, useContext } from 'react';
import { services as defaultServices } from '../services';
import type { Services } from '../services/interfaces';

/**
 * Services are injected, so tests and Storybook can substitute fakes and
 * engineering can swap in production implementations without touching any
 * component.
 */
const ServicesContext = createContext<Services>(defaultServices);
export function ServicesProvider({
  services = defaultServices,
  children



}: {services?: Services;children: React.ReactNode;}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}
export function useServices(): Services {
  return useContext(ServicesContext);
}