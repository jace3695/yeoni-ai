/** Synthetic-only cumulative billing snapshots. Not authentication, provider
 * invoice ingestion, a payment operation, or a real dispatch authorization.
 * Approval is seeded separately by privileged fixtures, never by this client.
 */
import { canonicalRecords, recordVersion, type RecordApp } from './generated-record-reply.ts';
import type { LocalReplyDatabase } from './local-durable-reply.ts';
import type { CostPool } from './synthetic-cost-quote.ts';
export type SyntheticBillingSnapshot = {
  schema: 'synthetic-billing-adjustment-v1'; mode: 'synthetic'; kind: 'cumulative_receipt_total';
  eventId: string; snapshotId: string; owner: string; app: RecordApp; version: string; pool: CostPool;
  sequence: number; originalActualMicroKrw: number; previousTotalMicroKrw: number; totalActualMicroKrw: number;
};
export type SyntheticBillingEnvelope = { contractText: string; contractHash: string };
export type BillingAdjustmentResult = {
  status: 'recorded' | 'duplicate' | 'held' | 'rejected' | 'unavailable' | 'uncertain';
  addedMicroKrw?: number; reason?: string;
};
/** Canonicalization is not approval. SQL independently validates every field. */
export async function bindSyntheticBillingSnapshot(snapshot: SyntheticBillingSnapshot): Promise<SyntheticBillingEnvelope> {
  return { contractText: canonicalRecords(snapshot), contractHash: await recordVersion(snapshot) };
}
export class LocalBillingAdjustmentClient {
  #db: LocalReplyDatabase;
  constructor(db: LocalReplyDatabase, authority: { mode: 'synthetic'; authority: 'fixture-only' }) {
    if (authority?.mode !== 'synthetic' || authority.authority !== 'fixture-only') throw new Error('Explicit synthetic fixture authority required');
    this.#db = db;
  }
  /** A commit/ACK error is UNCERTAIN, never success or permission to keep sending.
   * Stop the workflow; only retry the exact event/envelope to resolve ambiguity.
   * The database adapter MUST resolve after its own durable commit ACK. Ambient
   * BEGIN/ROLLBACK and ACK timing cannot be authenticated by this interface.
   */
  async append(envelope: SyntheticBillingEnvelope): Promise<BillingAdjustmentResult> {
    try {
      const encoded = canonicalRecords(envelope);
      const { rows } = await this.#db.query<{ result: BillingAdjustmentResult }>('select reply_local.adjust_billing($1::jsonb) result', [encoded]);
      const result = rows[0]?.result;
      if (!result || !['recorded', 'duplicate', 'held', 'rejected', 'unavailable'].includes(result.status)) return { status: 'uncertain' };
      return result;
    } catch { return { status: 'uncertain' }; }
  }
}
