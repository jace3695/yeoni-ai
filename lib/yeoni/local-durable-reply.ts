/** Isolated synthetic adapter, deliberately not imported by any application route.
 * Authority must eventually be established server-side, never from request owner IDs.
 * This constructor accepts ONLY a fixture identity; it is not an auth boundary.
 */
import { recordVersion, type Analysis, type RecordApp } from './generated-record-reply.ts';
export interface LocalReplyDatabase { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }
export type LocalReplyResult = { status: 'ready' | 'reserved' | 'busy' | 'uncertain' | 'deleted' | 'stale' | 'budget' | 'unavailable'; answer?: Analysis };
export class LocalDurableReplyClient {
  private db: LocalReplyDatabase;
  private owner: string;
  private epoch: number | null = null;
  private sessionGeneration = 0;
  constructor(db: LocalReplyDatabase, identity: { mode: 'synthetic'; owner: string }) {
    if (identity.mode !== 'synthetic' || !identity.owner) throw new Error('Synthetic identity required');
    this.db = db; this.owner = identity.owner;
  }
  async login() {
    const generation = ++this.sessionGeneration;
    this.epoch = null;
    await this.db.query('insert into reply_local.sessions(owner) values($1) on conflict do nothing', [this.owner]);
    const { rows } = await this.db.query<{ epoch: number | string }>('select epoch from reply_local.sessions where owner=$1', [this.owner]);
    if (generation === this.sessionGeneration) this.epoch = Number(rows[0].epoch);
  }
  async logout() {
    this.sessionGeneration++;
    this.epoch = null; // Immediately prevent display even if storage is unavailable.
    await this.db.query('update reply_local.sessions set epoch=epoch+1 where owner=$1', [this.owner]);
  }
  /** Revision is a trusted monotonically increasing source commit sequence.
   * Hash only COMPLETE original content, excluding sync timestamps/UI/date windows.
   * Production must publish source atomically with authoritative record writes.
   */
  async publish(app: RecordApp, revision: number, records: unknown, deleted = false) {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid source revision');
    const version = await recordVersion(records);
    const { rows } = await this.db.query<{ ok: boolean }>('select reply_local.publish_source($1,$2,$3,$4,$5) ok', [this.owner, app, revision, version, deleted]);
    if (!rows[0].ok) throw new Error('Stale source revision');
    return version;
  }
  async reserve(app: RecordApp, revision: number, version: string, pool: 'analysis' | 'voice', conservativeQuote: number | null): Promise<LocalReplyResult> {
    if (this.epoch === null) return { status: 'stale' };
    // All-in integer micro-KRW estimate (1 KRW = 1,000,000) (FX, tax and uncertainty margin supplied upstream).
    // Invalid estimates still allow exact cache reads, never new reservations.
    const quote = conservativeQuote !== null && Number.isSafeInteger(conservativeQuote) && conservativeQuote > 0 ? conservativeQuote : null;
    const epoch = this.epoch, generation = this.sessionGeneration;
    try {
      const { rows } = await this.db.query<{ result: LocalReplyResult }>('select reply_local.reserve($1,$2,$3,$4,$5,$6,$7) result', [this.owner, app, revision, version, pool, quote, epoch]);
      if (this.epoch !== epoch || this.sessionGeneration !== generation) return { status: 'stale' };
      return rows[0].result;
    } catch { return { status: 'unavailable' }; }
  }
  /** Acknowledged once-only claim, not an external exactly-once guarantee.
   * Lost commit ACK throws; caller must stop, never dispatch/reclaim on error.
   */
  async claim(app: RecordApp, revision: number, version: string, pool: 'analysis' | 'voice', invocation: string) {
    if (this.epoch === null) return false;
    const generation = this.sessionGeneration, epoch = this.epoch;
    const { rows } = await this.db.query<{ ok: boolean }>('select reply_local.claim($1,$2,$3,$4,$5,$6,$7) ok', [this.owner, app, revision, version, pool, epoch, invocation]);
    return this.sessionGeneration === generation && this.epoch === epoch && rows[0].ok;
  }
  /** Call only for an existing reservation. Failure leaves funds reserved.
   * Result delivery must re-check source revision + session via reserve after this.
   */
  async finish(app: RecordApp, version: string, pool: 'analysis' | 'voice', answer: Analysis | null, invocation: string) {
    if (answer && (answer.mode !== 'mock' || answer.sourceVersion !== version || !answer.text.trim() || answer.text.length > 4000 || !Number.isFinite(Date.parse(answer.generatedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(answer.analysisDate))) throw new Error('Invalid synthetic answer');
    const { rows } = await this.db.query<{ ok: boolean }>('select reply_local.finish($1,$2,$3,$4,$5::jsonb,$6) ok', [this.owner, app, version, pool, answer === null ? null : JSON.stringify(answer), invocation]);
    return rows[0].ok;
  }
}
