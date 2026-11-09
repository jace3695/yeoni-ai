/** Isolated synthetic preparation. No transport, credentials or application
 * route imports this client. Fixture identity and database access are trusted
 * test inputs, not implemented server authentication. Numeric legacy reserve
 * and claim are deliberately absent from this API (including at runtime).
 */
import { canonicalRecords, recordVersion, type Analysis, type RecordApp } from './generated-record-reply.ts';
import type { LocalReplyDatabase, LocalReplyResult } from './local-durable-reply.ts';
import { canonicalBoundRequest, type SyntheticBoundRequest, type SyntheticQuoteBinding } from './synthetic-quote-binding.ts';
import type { CostPool } from './synthetic-cost-quote.ts';
export type QuotedReplyResult = LocalReplyResult & { quoteId?: string; reason?: string };
export class LocalQuotedReplyClient {
  #db: LocalReplyDatabase;
  #owner: string;
  #epoch: number | null = null;
  #sessionGeneration = 0;
  #sourceGenerations = new Map<RecordApp, number>();
  constructor(db: LocalReplyDatabase, identity: { mode: 'synthetic'; owner: string }) {
    if (identity.mode !== 'synthetic' || typeof identity.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,127}$/.test(identity.owner)) throw new Error('Synthetic identity required');
    this.#db = db; this.#owner = identity.owner;
  }
  async login() {
    const generation = ++this.#sessionGeneration; this.#epoch = null;
    await this.#db.query('insert into reply_local.sessions(owner) values($1) on conflict do nothing', [this.#owner]);
    const { rows } = await this.#db.query<{ epoch: string | number }>('select epoch from reply_local.sessions where owner=$1', [this.#owner]);
    const epoch = Number(rows[0]?.epoch);
    if (generation === this.#sessionGeneration && Number.isSafeInteger(epoch) && epoch >= 0) this.#epoch = epoch;
  }
  async logout() {
    this.#sessionGeneration++; this.#epoch = null;
    await this.#db.query('update reply_local.sessions set epoch=epoch+1 where owner=$1', [this.#owner]);
  }
  async publish(app: RecordApp, revision: number, records: unknown, deleted = false) {
    this.#sourceGenerations.set(app, (this.#sourceGenerations.get(app) ?? 0) + 1);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid source revision');
    const version = await recordVersion(records);
    const { rows } = await this.#db.query<{ ok: boolean }>('select reply_local.publish_source($1,$2,$3,$4,$5) ok', [this.#owner, app, revision, version, deleted]);
    if (!rows[0]?.ok) throw new Error('Stale source revision');
    return version;
  }
  async reserve(app: RecordApp, revision: number, version: string, pool: CostPool, binding: SyntheticQuoteBinding | null): Promise<QuotedReplyResult> {
    if (this.#epoch === null) return { status: 'stale' };
    const epoch = this.#epoch, generation = this.#sessionGeneration, source = this.#sourceGenerations.get(app);
    try {
      // JSON data only. Invalid/missing contracts still permit an exact cache read.
      let envelope: string | null = null;
      try { if (binding !== null) envelope = canonicalRecords(binding); } catch { /* cache-only */ }
      const { rows } = await this.#db.query<{ result: QuotedReplyResult }>('select reply_local.reserve_quoted($1,$2,$3,$4,$5,$6::jsonb,$7) result', [this.#owner, app, revision, version, pool, envelope, epoch]);
      if (this.#epoch !== epoch || this.#sessionGeneration !== generation || this.#sourceGenerations.get(app) !== source) return { status: 'stale' };
      return rows[0].result;
    } catch { return { status: 'unavailable' }; }
  }
  /** Inert synthetic acknowledgement, NEVER permission for a real send.
   * Adapter precondition: query resolves only AFTER its durable transaction
   * commit ACK. Rows returned inside an external BEGIN/ambient transaction
   * are not that ACK: rollback removes the claim and permits a later claim.
   * This interface cannot enforce commit semantics. Lost commit ACK: stop.
   * Cross-client logout/deletion or expiry during delayed ACK delivery cannot
   * revoke an already committed response. No external exactly-once guarantee.
   */
  async claim(app: RecordApp, revision: number, version: string, pool: CostPool, quoteId: string, request: SyntheticBoundRequest, invocation: string): Promise<boolean> {
    if (this.#epoch === null) return false;
    let requestCanonical: string;
    try { requestCanonical = canonicalBoundRequest(request); } catch { return false; }
    const epoch = this.#epoch, generation = this.#sessionGeneration, source = this.#sourceGenerations.get(app);
    const { rows } = await this.#db.query<{ ok: boolean }>('select reply_local.claim_quoted($1,$2,$3,$4,$5,$6,$7,$8,$9) ok', [this.#owner, app, revision, version, pool, epoch, quoteId, requestCanonical, invocation]);
    return this.#epoch === epoch && this.#sessionGeneration === generation && this.#sourceGenerations.get(app) === source && rows[0]?.ok === true;
  }
  async finish(app: RecordApp, version: string, pool: CostPool, answer: Analysis | null, invocation: string) {
    if (answer && (answer.mode !== 'mock' || answer.sourceVersion !== version || !answer.text.trim() || answer.text.length > 4000 || !Number.isFinite(Date.parse(answer.generatedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(answer.analysisDate))) throw new Error('Invalid synthetic answer');
    const { rows } = await this.#db.query<{ ok: boolean }>('select reply_local.finish($1,$2,$3,$4,$5::jsonb,$6) ok', [this.#owner, app, version, pool, answer === null ? null : JSON.stringify(answer), invocation]);
    return rows[0]?.ok === true;
  }
}
