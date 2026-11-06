import type { RecordApp, SourceSnapshot } from './generated-record-reply';
/** Full original persisted records only. No today/window/selected route/summary. */
export function replySource(owner: string | null | undefined, app: RecordApp, records: unknown, ready: boolean, fullSource = true): SourceSnapshot {
  return { owner: owner ?? '', app, complete: Boolean(owner && ready && fullSource), records: JSON.parse(JSON.stringify(records ?? null)) };
}
// A rolling server query is not a durable record revision. It MUST NOT trigger a
// future live request until a server-authenticated full-source revision exists.
export function rollingReplySource(owner: string | null | undefined, app: RecordApp, records: unknown, ready: boolean) {
  return replySource(owner, app, records, ready, false);
}
