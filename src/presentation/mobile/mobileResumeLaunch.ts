import { createContext, useContext } from 'react';
import type { MobileResumeRecord } from './mobileResumeState';

export type MobileResumeLaunch = { accountId: string; record: MobileResumeRecord; feeds: Set<string> };
export const MobileResumeLaunchContext = createContext<MobileResumeLaunch | null>(null);
export const useMobileResumeLaunch = () => useContext(MobileResumeLaunchContext);
