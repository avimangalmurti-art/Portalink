import { useEffect, useRef, type RefObject } from 'react';
import type { ProjectAttachment } from '../../types/domain';
import { projectPageMap } from './readSignal';
import { createReachCollector, reachTabToken, sendReach } from './reachCollector';
/** Observe painted, actually visible pages on WEB and MOBILE, not prefetch margins. */
export function useProjectReach(root: RefObject<HTMLElement>, projectId: string, attachments: ProjectAttachment[], enabled: boolean) {
    const latest = useRef(attachments);
    latest.current = attachments;
    useEffect(() => {
        if (!enabled || !/^[a-f0-9-]{36}$/i.test(projectId))
            return;
        let frame: number | undefined, stopped = false, collector: ReturnType<typeof createReachCollector> | undefined;
        const resolved: Record<string, number> = {};
        const measure = () => {
            frame = undefined;
            const surface = root.current;
            if (stopped || !surface || document.visibilityState !== 'visible' || surface.closest('[inert],.screen-exit,[aria-hidden="true"]'))
                return;
            const elements = Array.from(surface.querySelectorAll<HTMLElement>('[data-reach-attachment][data-project-page-number]'));
            for (const el of elements) {
                const count = Number(el.dataset.projectPageTotal), id = el.dataset.reachAttachment;
                if (id && count > 0 && latest.current.some(a => a.id === id && a.kind === 'document'))
                    resolved[id] = count;
            }
            const pages = projectPageMap(latest.current, resolved);
            if (!pages.length)
                return;
            collector ??= createReachCollector(projectId, pages.length, { token: reachTabToken(), referrer: document.referrer, via: new URLSearchParams(location.search).get('via'), origin: location.origin, width: window.innerWidth, send: sendReach });
            const bounds = surface.getBoundingClientRect(), top = Math.max(0, bounds.top), bottom = Math.min(window.innerHeight, bounds.bottom), left = Math.max(0, bounds.left), right = Math.min(window.innerWidth, bounds.right);
            for (const el of elements) {
                if (el.dataset.projectPageReady !== 'true')
                    continue;
                const rect = el.getBoundingClientRect(), area = Math.max(0, Math.min(bottom, rect.bottom) - Math.max(top, rect.top)) * Math.max(0, Math.min(right, rect.right) - Math.max(left, rect.left));
                if (area <= 0 || area < Math.min(rect.width * rect.height * .25, window.innerWidth * window.innerHeight * .25))
                    continue;
                const page = pages.find(p => p.attachmentId === el.dataset.reachAttachment && p.pageIndex === Number(el.dataset.projectPageNumber) - 1);
                if (page)
                    collector.reached(page.page);
            }
        };
        const schedule = () => { if (!stopped && frame === undefined)
            frame = requestAnimationFrame(measure); };
        const mutation = new MutationObserver(schedule), resize = new ResizeObserver(schedule);
        const surface = root.current;
        if (surface) {
            mutation.observe(surface, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-project-page-ready', 'data-project-page-number', 'data-project-page-total', 'data-reach-attachment'] });
            resize.observe(surface);
            surface.addEventListener('scroll', schedule, true);
            surface.addEventListener('load', schedule, true);
        }
        const leaving = () => { if (document.visibilityState === 'hidden')
            collector?.flushEligible();
        else
            schedule(); };
        const pagehide = () => collector?.flushEligible();
        window.addEventListener('pagehide', pagehide);
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        document.addEventListener('visibilitychange', leaving);
        schedule();
        return () => { stopped = true; if (frame !== undefined)
            cancelAnimationFrame(frame); collector?.close(); mutation.disconnect(); resize.disconnect(); surface?.removeEventListener('scroll', schedule, true); surface?.removeEventListener('load', schedule, true); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('visibilitychange', leaving); window.removeEventListener('pagehide', pagehide); };
    }, [enabled, projectId, root]);
}
