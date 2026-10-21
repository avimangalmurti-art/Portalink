import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { observeViewerMemory, primeViewerMemory, type ViewerMemory } from '../../components/media/viewerMemory';
import { mobileResumeReaderView, mobileResumeViewerEntry, readMobileResume, saveMobileResumeReader, safeMobileResumePath, type MobileResumeReaderView, type MobileResumeRecord, type MobileResumeViewerState } from './mobileResumeState';
import { MobileResumeLaunchContext, type MobileResumeLaunch } from './mobileResumeLaunch';

const viewerFields = ['focusedPageNumber', 'lastFocusedPageNumber', 'focusedPageId', 'lastFocusedPageId', 'zoom', 'scrollTop', 'scrollLeft', 'pagesPerRow', 'activeAttachmentId'] as const;
const projectPath = (path: string) => /^\/p\/[A-Za-z0-9_-]+\/c\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(path);

/** Hints contain positions only. Every resumed destination still loads through ordinary access checks. */
export function MobileResumeProvider({ enabled, accountId, record, children }: { enabled: boolean; accountId: string | null; record: MobileResumeRecord | null; children: React.ReactNode }) {
  const { pathname, search, hash } = useLocation();
  const path = safeMobileResumePath(pathname + search + hash);
  const latest = useRef({ enabled, accountId }); latest.current = { enabled, accountId };
  const launch = useMemo<MobileResumeLaunch | null>(() => enabled && accountId && record?.accountId === accountId ? { accountId, record, feeds: new Set() } : null, [enabled, accountId, record]);
  const seeded = useRef<MobileResumeRecord | null>(null);
  // This precedes child reader initialization; seeding the same validated values is idempotent.
  if (launch && path && seeded.current !== launch.record && launch.record.path.split('?')[0] === pathname && launch.record.reader?.path.split('?')[0] === pathname) {
    for (const entry of launch.record.reader.entries ?? []) primeViewerMemory(entry.key, entry.state);
    seeded.current = launch.record;
  }

  useEffect(() => {
    if (!enabled || !accountId || !path || !projectPath(pathname)) return;
    const projectId = pathname.split('/')[5];
    const prior = readMobileResume(accountId)?.reader;
    const entries = new Map<string, MobileResumeViewerState>(prior?.path.split('?')[0] === pathname ? prior.entries?.map(entry => [entry.key, entry.state]) : []);
    let view: MobileResumeReaderView | undefined = prior?.path.split('?')[0] === pathname ? prior.view : undefined;
    let timer = 0, dirty = false;
    const captureView = () => {
      const stage = document.querySelector<HTMLElement>(`.app-screen-layer.screen-active [data-project-stage][data-project-continuity-id="${projectId}"]`);
      if (!stage || stage.closest('[inert], [aria-hidden="true"], [data-motion-snapshot]') || stage.closest('[data-premium-project-viewer]')?.getAttribute('data-read-only-share') === 'true') return;
      const focused = stage.querySelector<HTMLElement>('[data-mobile-focused-view]');
      const page = (focused ?? stage).querySelector<HTMLElement>('[data-project-page-number][data-reach-attachment]');
      // A loading skeleton has no page/mode to checkpoint yet.
      if (!page) return;
      const next = mobileResumeReaderView(focused ? { mode: 'focused', attachmentId: page.dataset.reachAttachment, page: Number(page.dataset.projectPageNumber) } : { mode: 'overview' });
      if (next && JSON.stringify(next) !== JSON.stringify(view)) { view = next; dirty = true; }
    };
    const flush = () => {
      window.clearTimeout(timer); timer = 0;
      if (!latest.current.enabled || latest.current.accountId !== accountId) return;
      captureView();
      if (!dirty) return;
      dirty = false;
      saveMobileResumeReader(accountId, pathname, { ...(entries.size ? { entries: [...entries].map(([key, state]) => ({ key, state })) } : {}), ...(view ? { view } : {}) });
    };
    const changed = (key: string, state: ViewerMemory) => {
      const parts = key.split(':');
      if (parts[0] !== 'workspace' || parts[2] !== projectId) return;
      const safe: MobileResumeViewerState = {};
      for (const field of viewerFields) if (state[field] !== undefined) Object.assign(safe, { [field]: state[field] });
      const entry = mobileResumeViewerEntry(pathname, key, safe);
      if (!entry) return;
      entries.delete(key); entries.set(key, entry.state);
      const parent = parts[1] === 'document' ? parts.slice(0, 5).join(':') : parts.slice(0, 3).join(':');
      while (entries.size > 6) {
        const oldest = [...entries.keys()].find(candidate => candidate !== `workspace:project:${projectId}` && candidate !== parent);
        if (!oldest) break;
        entries.delete(oldest);
      }
      dirty = true; window.clearTimeout(timer); timer = window.setTimeout(flush, 750);
    };
    const unsubscribe = observeViewerMemory(changed);
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { unsubscribe(); flush(); window.clearTimeout(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, [enabled, accountId, path, pathname]);
  return <MobileResumeLaunchContext.Provider value={launch}>{children}</MobileResumeLaunchContext.Provider>;
}
