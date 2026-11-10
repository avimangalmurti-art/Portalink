import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useServices } from '../../contexts/ServicesContext';
import type { ProjectService } from '../../services/interfaces';
import type { Project, ProjectView } from '../../types/domain';
import { isPublicSharePath } from '../sharing/shareModel';

type Entry = { project?: Project; pending?: Promise<void>; error?: string };
type Cache = { revision: number; service: ProjectService; entries: Map<string, Entry> };
const caches = new WeakMap<object, Cache>();
const MAX_CACHED_PROJECTS = 48;

function contentCache(scope: object, revision: number, service: ProjectService): Cache {
  let cache = caches.get(scope);
  if (!cache || cache.revision !== revision || cache.service !== service) {
    cache = { revision, service, entries: new Map() };
    caches.set(scope, cache);
  }
  return cache;
}

/** Overview records intentionally omit originals; only this service result is complete. */
function checkedProject(view: ProjectView, summary: Project, creatorId: string, publicOnly: boolean): Project {
  if (view.creator.id !== creatorId || view.project.id !== summary.id || view.project.categoryId !== summary.categoryId
    || !Array.isArray(view.project.attachments)
    || (publicOnly && (view.creator.isPrivate || view.project.isPubliclyVisible === false))) {
    throw new Error('These project pages are unavailable.');
  }
  return view.project;
}

/** Load originals for nearby one-column cards, without expanding the grid's cover read. */
export function useInlineProjectContent({ project, creatorId, enabled, active, hostRef }: {
  project: Project; creatorId: string; enabled: boolean; active: boolean; hostRef: RefObject<HTMLElement | null>;
}) {
  const { projects } = useServices();
  const { scope, revision } = useProfileData();
  const accountId = useAuth().user?.id ?? null;
  const publicOnly = isPublicSharePath(useLocation().pathname);
  const cache = contentCache(scope, revision, projects);
  const key = JSON.stringify([accountId, creatorId, project.categoryId, project.id, publicOnly]);
  const observation = useMemo(() => ({ cache, key, enabled, active }), [cache, key, enabled, active]);
  const [visibility, setVisibility] = useState<{ observation: object; near: boolean } | null>(null);
  const [, refresh] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const near = visibility?.observation === observation && visibility.near;
  const entry = cache.entries.get(key);

  useEffect(() => {
    if (!enabled || !active) return;
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisibility({ observation, near: true });
      return;
    }
    const observer = new IntersectionObserver(([record]) => {
      setVisibility({ observation, near: record.isIntersecting });
    }, { rootMargin: '240px 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, [enabled, active, observation, hostRef]);

  useEffect(() => {
    if (!enabled || !active || !near) return;
    let live = true;
    let current = cache.entries.get(key);
    if (!current) {
      // Keep the per-scope session cache bounded; in-flight consumers retain their entry.
      if (cache.entries.size >= MAX_CACHED_PROJECTS) {
        const oldest = [...cache.entries].find(([, value]) => !value.pending)?.[0];
        if (oldest !== undefined) cache.entries.delete(oldest);
      }
      current = {};
      cache.entries.set(key, current);
    }
    if (current.project || current.error) return;
    const selected = current;
    if (!selected.pending) {
      selected.pending = Promise.resolve().then(() => projects.getProjectView(project.id)).then(view => {
        selected.project = checkedProject(view, project, creatorId, publicOnly);
      }).catch((error: unknown) => {
        selected.error = error instanceof Error ? error.message : 'Project pages could not be loaded.';
      }).finally(() => { selected.pending = undefined; });
    }
    refresh(value => value + 1);
    void selected.pending.then(() => { if (live) refresh(value => value + 1); });
    return () => { live = false; };
    // The cache key, revision and scope identify the immutable service read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, active, near, cache, key, attempt]);

  const retry = useCallback(() => {
    const current = cache.entries.get(key);
    if (current?.pending) return;
    cache.entries.delete(key);
    setAttempt(value => value + 1);
  }, [cache, key]);

  return { project: entry?.project ?? project, metadataComplete: Boolean(entry?.project), loading: Boolean(entry?.pending),
    error: entry?.error ?? null, retry };
}
