import type { BodyAnalysisSnapshot } from './body-analysis-history';

export type BodyArchiveDraft = { ownerId: string; snapshot: BodyAnalysisSnapshot; question?: string };
// Explicit navigation handoff only. Never persisted, logged, or sent by this module.
let staged: { draft: BodyArchiveDraft; epoch: string | null } | null = null;
let listening = false;
export function clearBodyArchiveDraft() { staged = null; }
function watch() {
  if (listening) return;
  listening = true;
  window.addEventListener('pagehide', clearBodyArchiveDraft);
  window.addEventListener('yeoni-cloud-session-changed', clearBodyArchiveDraft);
  window.addEventListener('yeoni-preference-owner-changed', clearBodyArchiveDraft);
  window.addEventListener('storage', event => {
    if (event.key === null || ['fitness-cloud-sync-user', 'fitness-cloud-sync-epoch'].includes(event.key)) clearBodyArchiveDraft();
  });
}
export function stageBodyArchiveDraft(draft: BodyArchiveDraft): boolean {
  clearBodyArchiveDraft();
  try {
    if (!draft.ownerId || localStorage.getItem('fitness-cloud-sync-user') !== draft.ownerId) return false;
    watch();
    staged = { draft: structuredClone(draft), epoch: localStorage.getItem('fitness-cloud-sync-epoch') };
    return true;
  } catch { return false; }
}
export function readBodyArchiveDraft(ownerId: string | null): BodyArchiveDraft | null {
  try {
    if (!staged || !ownerId || staged.draft.ownerId !== ownerId || localStorage.getItem('fitness-cloud-sync-user') !== ownerId || staged.epoch !== localStorage.getItem('fitness-cloud-sync-epoch')) {
      clearBodyArchiveDraft(); return null;
    }
    return staged.draft;
  } catch { clearBodyArchiveDraft(); return null; }
}
