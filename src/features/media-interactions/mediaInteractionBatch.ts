import { mediaInteractionRequest } from './mediaInteractionRequest';
import type { MediaInteractionRecord, MediaInteractionTarget } from './useMediaInteractions';

type Pending = {
  target: MediaInteractionTarget;
  resolve: (record: MediaInteractionRecord) => void;
  reject: (error: unknown) => void;
  promise: Promise<MediaInteractionRecord>;
};
type Group = { pending: Map<string, Pending>; timer: ReturnType<typeof setTimeout> | null };
const groups = new Map<string | null, Group>();
const keyOf = (target: MediaInteractionTarget) => JSON.stringify([target.projectId, target.attachmentId, target.pageIndex]);

/** Coalesce nearby visible pages; never retain account-specific activity after the request. */
export function readMediaInteraction(target: MediaInteractionTarget, account: string | null): Promise<MediaInteractionRecord> {
  let group = groups.get(account);
  if (!group) { group = { pending: new Map(), timer: null }; groups.set(account, group); }
  const key = keyOf(target);
  const existing = group.pending.get(key);
  if (existing) return existing.promise;
  let resolve!: Pending['resolve'];
  let reject!: Pending['reject'];
  const promise = new Promise<MediaInteractionRecord>((accept, decline) => { resolve = accept; reject = decline; });
  group.pending.set(key, { target, resolve, reject, promise });
  if (group.timer === null) {
    const scheduled = group;
    group.timer = setTimeout(() => { void flush(account, scheduled); }, 12);
  }
  return promise;
}

async function flush(account: string | null, group: Group) {
  groups.delete(account);
  const entries = [...group.pending.values()];
  const serialize = (page: Pending[]) => JSON.stringify({ targets: page.map(({ target }) => ({
    projectId: target.projectId, attachmentId: target.attachmentId, pageIndex: target.pageIndex,
  })) });
  // Count encoded bytes too: Unicode storage paths can use more than one byte per character.
  const encoder = new TextEncoder();
  for (let offset = 0; offset < entries.length;) {
    let page = entries.slice(offset, offset + 10);
    while (page.length > 1 && encoder.encode(serialize(page)).byteLength > 16_000) page = page.slice(0, -1);
    offset += page.length;
    try {
      const result = await mediaInteractionRequest<{ items: Array<{ target: MediaInteractionTarget; record: MediaInteractionRecord }> }>(
        '/api/media-interactions/batch', { method: 'POST', body: serialize(page) }, false, account);
      const records = new Map(result.items.map((item) => [keyOf(item.target), item.record]));
      for (const pending of page) {
        const record = records.get(keyOf(pending.target));
        if (record) pending.resolve(record);
        else pending.reject(new Error('This page activity is temporarily unavailable.'));
      }
    } catch (error) { for (const pending of page) pending.reject(error); }
  }
}
