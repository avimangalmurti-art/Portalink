import { OPTIONAL_COLLECTION_ENABLED } from '../launch/adultLaunch';
import { classifyReferrer, viewportBucket, type ReachPayload } from './readSignal';
let tabToken: string | undefined;
/** No storage: this value disappears on reload and cannot follow a visitor. */
export function reachTabToken(): string { return tabToken ??= crypto.randomUUID(); }
export function createReachCollector(projectId: string, pageCount: number, options: {
    token: string;
    referrer: string;
    via: string | null;
    origin: string;
    width: number;
    send: (payload: ReachPayload) => void;
    now?: () => number;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
}) {
    const now = options.now ?? Date.now, setTimer = options.setTimer ?? setTimeout, clearTimer = options.clearTimer ?? clearTimeout;
    let furthest = -1, sent = -2, last = 0, timer: ReturnType<typeof setTimeout> | undefined, closed = false;
    const payload = (): ReachPayload => ({ project_id: projectId, session_token: options.token, furthest_page: furthest, page_count: pageCount, ref_class: classifyReferrer(options.referrer, options.via, options.origin), vw_bucket: viewportBucket(options.width) });
    const flush = () => { timer = undefined; if (furthest <= sent)
        return; sent = furthest; last = now(); options.send(payload()); };
    flush();
    last = -Infinity; // Opening is separate from the throttled progress updates.
    return { reached(page: number) { if (closed || !Number.isInteger(page) || page < 0 || page >= pageCount || page <= furthest)
            return; furthest = page; if (timer === undefined)
            timer = setTimer(flush, Math.max(0, 10000 - (now() - last))); }, flushEligible() { if (furthest > sent && now() - last >= 10000) {
            if (timer !== undefined)
                clearTimer(timer);
            flush();
        } }, close() { closed = true; /* Retain the trailing timer across SPA navigation; it contains no account data. */ }, cancel() { closed = true; if (timer !== undefined)
            clearTimer(timer); } };
}
export function sendReach(payload: ReachPayload): void {
    if (!OPTIONAL_COLLECTION_ENABLED) return;
    // sendBeacon always uses credentials:include. A credential-free keepalive
    // request preserves the requested no-cookies boundary even on same-origin.
    void fetch('/api/reach', { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, cache: 'no-store', headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload) }).catch(() => undefined);
}
