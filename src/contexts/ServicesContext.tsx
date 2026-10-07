import React, { createContext, useContext } from 'react';
import type { Services } from '../services/interfaces';

/**
 * Services are injected, so tests and Storybook can substitute fakes and
 * engineering can swap in production implementations without touching any
 * component.
 */
const ServicesContext = createContext<Services | null>(null);
export function ServicesProvider({
  services,
  children



}: {services: Services;children: React.ReactNode;}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('A service registry must be provided by the application entry.');
  return services;
}
