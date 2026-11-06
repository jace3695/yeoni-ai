# Local durable reply candidate — disabled, synthetic only

Base b66eaec. This is a standalone local adapter and SQL draft, NOT a Supabase migration or live backend. The application imports neither. POST /api/yeoni/record-reply remains unconditional 503. No provider or TTS transport exists here. No auth/permission/key settings changed.

## Reused contracts and deliberate boundaries

Reviewed modules/ai-budget-control/{index,persistence}.ts: integer **micro-KRW** (1 KRW=1,000,000), no repeated dispatch grant, unknown commit throws rather than declaring rollback, retained liabilities, no TTL claims, actual settlement never clipped. The new SQL stores cache + receipt + global/account admission atomically; it does not layer a separate account-only CAS over a non-atomic project cap. Existing production budget routes are unchanged.

`LocalDurableReplyClient` accepts explicitly synthetic identities only. It is NOT authentication. A future server must derive owner from verified server session and authorize every operation. Caller-supplied owner or source versions must never be trusted in a live route. This adapter exposes no API, secrets, provider or remote database access.

A trusted publisher supplies a monotonic full-source commit revision and canonical content SHA256. Entire persisted originals belong in records; transient synchronization times, selected date ranges, app launch dates and UI state do not. A future backend must write source revision/hash in the SAME transaction as original record changes. This local prototype publishes separately because it has no real record store. Source completeness and ownership must be established upstream. It is not ready for live account integration.

## Transaction and delivery contract

- `reserve`: one database transaction locks/updates global mutex generation, checks session/source, reads exact-version cache FIRST, then inserts unique owner/app/version/pool receipt and checks both account and project pool totals. Invalid/missing quote permits only cache reuse. DB error returns unavailable; never dispatch.
- `claim`: a separate transaction checks source revision/deletion/session again and stores a once-only invocation. A reserve result is NOT dispatch permission. Never retry a claim grant, including with the same invocation. Lost commit ACK throws; stop. No TTL/reclaim on worker death.
- `finish`: requires matching invocation, preserves entire cost, stores mock-only validated response under exact source version. Finalization checks current source version under the same lock and suppresses an obsolete in-flight result, retaining its liability. A previously completed source version can retain its exact cache, but delivery MUST re-read reserve with current authoritative revision/session. No completion return should directly render a response. Explicit purge prevents late finish from changing deleted tombstones.
- `settle`: records actual micro-KRW without clipping, conflicting repeats fail. Conservative admission uses max(quote,actual); no refunds in this draft. Settlement failure leaves liability untouched. Retaining a quote above actual is intentionally conservative.
- Generation UPDATE prevents stale-snapshot mutex waiters silently passing under stronger transaction isolation; serialization/commit errors fail closed. Actual PostgreSQL locking and partition behavior remain unverified.
- A DB transaction does not guarantee exactly-once external side effects. No provider send occurs in these tests.

## Session, deletion and retention

Logout clears local session immediately and increments durable owner session epoch. Same-owner login can reuse cached answers; another owner cannot. Explicit record deletion/privacy purge is different: trusted publisher MUST call publish(..., erase=true) with a new revision before publishing remaining/new records with a later revision. This clears all app answers and retains all receipt/claim tombstones. Ordinary edits publish a new revision/content, retaining old exact-version caches; changes that remove sensitive content must use purge, not edit alone. Delayed lower revisions are rejected. Restoring a purged content hash returns deleted, not a new paid generation. Changed content may get a new reservation only under policy. No automatic TTL or tombstone removal.

Real data retention/deletion durations, legal treatment of content hashes and financial receipts, encryption/RLS/role design, backup erasure and approved restoration/regeneration policy require decisions before activation. Current artifacts contain synthetic data only. Test SQL is not a production permission boundary.

## Budget policy — not activated

Monthly user goals: analysis 7,000 KRW; voice 3,000 KRW. Tests explicitly seed 20% headroom project ceilings 5,600/2,400 KRW and deliberately smaller account ceilings 2,800/1,200 KRW to prove independent limits. Those account ceilings are **test fixtures, not user policy**. No default production policy is configured. Determine project-total versus per-account allocation before live integration.

Admission month comes from DB UTC clock. Cached version identity never includes month/date. Receipts keep original reservation month; settlement does not move it. All prior-month unpriced, pending, uncertain, deleted, or above-estimate obligations remain charged against admission in later months. This intentionally may block indefinitely and requires explicit reviewed reconciliation; it never silently resets capacity. Completed, fully priced, non-overestimate prior-month receipts leave current admission. Billing month/timezone, delayed bill adjustments and reconciliation/credit policies must be decided before activation. Above-estimate liabilities have no automatic expiry in this prototype.

Quote must include all token/character dimensions, FX, tax and uncertainty buffer upstream. No exchange rate/model/provider defaults. Estimates and headroom do not guarantee final invoice absolute limits. Real provider bills, multi-server security, cross-region fencing, network partition and process-crash recovery are not certified.

## Verification scope

Tests exercise persistent disk reopen, owner isolation, cache without price, concurrent requests from two adapter clients, duplicate claim, source edits/deletion, late completion, unknown reservation/claim ACK, conservative month carry, settlement conflicts, missing policy/store and disabled API. `scripts/local-durable-reply/process-proof.mjs` uses two sequential OS processes and one disk store, proving receipts/claims/uncertain/tombstones/mock answer survive clean close/reopen. Interruption states are seeded; **no SIGKILL/power-loss crash was tested**.

PGlite is a single embedded PostgreSQL engine with serialized query execution. Parallel Promise clients DO NOT establish real independent PostgreSQL sessions or distributed concurrency. PostgreSQL server binaries are absent in this environment. Independent-process simultaneous access, real lock contention, isolation-level races, abrupt crash/fsync recovery and partitions are explicitly unexecuted. A local real PostgreSQL test environment plus live integration/security decisions are prerequisites before any real connection. No browser UI was changed; no new browser behavior claimed.
