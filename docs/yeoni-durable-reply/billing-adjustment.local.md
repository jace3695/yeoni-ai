# Synthetic append-only billing adjustment ledger

This is an isolated local PGlite candidate, not a production migration. No route imports the billing client. There is no provider integration, real invoice ingestion, paid request, payment/refund, server deployment, credential handling, authentication, privilege grant, or live monthly-budget activation. The 7,000/3,000 KRW figures remain goals, not approval to enable anything.

## Loading and authority

Load the candidate `schema.local.sql`, then `schema.quote-bound.local.sql` for quote-bound cases. Billing tables and functions are in the base schema so both legacy and quoted admission paths use the same liability calculation. Do not additionally load a separate billing overlay. Existing databases are not migrated by this experiment.

`LocalBillingAdjustmentClient` requires `{mode:'synthetic', authority:'fixture-only'}`. This marker is not an authentication boundary. An independent privileged test fixture must seed `billing_fixture_approvals(contract_hash,mode)` with the exact SHA-256 of `contractText` and `mode='synthetic'`. Neither this client nor a route exposes an approval method. Possession of direct database access remains trusted fixture setup, not a production security model.

Unapproved envelopes and invalid envelope hashes are rejected without inventing an authoritative charge or poisoning another caller's budget. Callers must stop this reconciliation workflow on rejection, uncertainty, or unavailable storage. Merely failing an approval check does not establish a valid unpaid charge. Approved but inconsistent content is an unresolved authoritative signal and creates a durable hold.

## Financial contract

The sole contract kind is `cumulative_receipt_total`. It is a complete snapshot of the total charge for one original receipt, not an incremental invoice amount. A newly arrived extra invoice must be incorporated in a newly approved cumulative total. There is deliberately no generic `add(delta)` interface.

All of these fields are bound by the exact approved contract hash:

- Schema `synthetic-billing-adjustment-v1`, mode `synthetic`, kind `cumulative_receipt_total`.
- Globally unique `eventId`, and globally identifying `snapshotId`.
- Receipt identity: owner, app, version hash, and cost pool.
- Original immutable settlement amount, sequence, previous cumulative total, and new cumulative total, in integer micro-KRW (1 KRW = 1,000,000 units).

Amounts and sequence must be integer JSON numbers at most 9,007,199,254,740,991. Sequence starts at 1. The first previous total equals the receipt's original settled actual. Subsequent new snapshots require exactly the next sequence and exact latest total. Existing actuals beyond the JS safe-integer range remain intact as SQL bigint values; this API cannot correct them and holds the affected pool on an approved incompatible submission. Numeric aggregation is SQL numeric, so sums beyond bigint cannot wrap into headroom.

The original `receipts.actual` is never overwritten. Existing settle conflicts remain errors. Once an audit event references a receipt, its financial identity, cost, original month, and original actual cannot be updated, and its receipt cannot be deleted through ordinary SQL DML. Events and holds reject UPDATE, DELETE, and TRUNCATE. These are integrity assertions, not a defense against a privileged database operator disabling triggers or rewriting schema.

### Replay and no-increase cases

- Exact event/hash retry returns duplicate, adds zero, and creates no new event.
- Same event ID with any other independently approved content is a conflict. Original and submitted pools are held; if the new pool is unknown, the hold is global.
- Same snapshot under a new event ID is allowed only with identical receipt identity, original actual, sequence, previous total, and total. It creates an audit alias with zero added amount. It cannot count the same invoice snapshot twice.
- A new snapshot with the next sequence and unchanged cumulative total is recorded with zero added amount.
- A valid first snapshot whose total equals original actual is also recorded with zero added amount. It does not reintroduce a fully priced old receipt into current admission. Its ID remains bound, so later content changes conflict.
- A known historical snapshot retry/alias may still be acknowledged after later snapshots, but adds zero. An unknown stale/reversed sequence or lower total is held.
- A total below original/current or an inconsistent previous total never creates a credit, removes liability, refunds a reservation, or resets a sequence.

## Holds and errors

An approved missing receipt, missing initial settlement, baseline mismatch, invalid contract, reversed/unknown sequence, lower total, or known identity conflict is not silently rejected while new calls continue. It appends a hold covering the affected pool. Same event/snapshot identities remain held on later retries or approved target changes, even if no financial event was ever accepted. Identity conflicts are checked before missing-target/baseline rejection so the original pool is also protected.

Holds are append-only and have no release endpoint or expiry. A new valid adjustment can still record an established financial fact while a pool is held, but cannot remove or resolve that hold. A new event ID, new receipt, policy increase, re-login, month change, exact replay, or restart does not lift it. A real manual reconciliation and any release protocol are outside this candidate.

A global hold is used only when approved malformed content cannot be assigned a known pool. Otherwise the other cost pool remains independent. Account-specific inconsistencies conservatively hold the pool project-wide because the project cap shares that exposure.

Unexpected SQL/storage errors roll back the statement or have an uncertain outcome. The client returns `uncertain`, never a success or new dispatch grant. It cannot persist a hold during an unavailable database or prove whether an external transaction committed. The caller must stop and resolve the exact event, not try a new event, reserve, claim, or external send. An exact retry after a committed lost ACK is safe and adds zero; a committed hold also survives lost ACK. No cross-client fencing during unknown/uncommitted database failure is claimed.

The schema format marker must be present and recognized for new reserve/claim paths. Missing schema/helper/table errors are fail-closed through existing reserve/claim error behavior. Exact cached answers remain available without invoking new billing admission; ordinary source/session/erasure checks still apply.

## Conservative admission exposure, not monthly accounting

`billing_liability(owner-or-null, pool, month)` groups events by receipt, takes the maximum approved cumulative total, and counts each receipt once. For a receipt that is currently included, exposure is `max(original quote, original actual, latest cumulative total)`.

The original inclusion conditions remain: original receipt month equals the current UTC month, original actual is unknown, actual exceeds quote, or state is pending/uncertain. In addition, any approved cumulative increase above original actual keeps that receipt included across later months. A zero-only snapshot does not activate this condition.

Example: an old fully priced done receipt has quote 100 and original actual 50. Before correction its later-month exposure is 0. A new cumulative total 80 represents an added charge of 30, while this conservative fixture keeps **100** admission exposure. The actual total is **80**, added charge **30**, and conservative admission exposure **100**; none is mislabeled as the other. If a later cumulative total is 120, exposure is 120 and total recorded added amount is 70. Existing current-month exposure is not separately added again, and the receipt's quote and cumulative total are not summed together.

This deliberately over-reserves historical exposure until a separately designed reconciliation policy exists. It is not a claim about which actual billing month owes the money, the amount actually due now, or a production accounting policy. There is no automatic next-month release. The original `receipt_month` and database `recorded_at` preserve original allocation versus recognition time without accepting a caller clock.

Both project and owner cap checks use this helper in legacy reserve/claim and quote-bound reserve/claim. Exact-cap admission is allowed; one unit over cap is denied. Existing unissued reservations are rechecked before claim. Claims already acknowledged cannot be retroactively revoked by this work. Exact cache reads do not incur new charges and precede holds/cap checks.

## Erasure and audit minimization

The financial ledger stores receipt identity/hash, synthetic event/snapshot references, original and cumulative monetary values, sequence, approved contract hash, disposition, original month, and database recognition time. It stores no answer, record content, prompt, invoice text, raw contract text, or arbitrary error payload. Holds store only sanitized IDs, contract fingerprint, pool, fixed reason code, and database time. Deleting source content preserves the erased marker and clears answers as before. A late correction does not restore or copy them.

## Verification and limits

Focused tests cover both cost APIs, project/account scopes, current/future-month calculation, quotes above the corrected total, exact caps, aliases and changed IDs, valid initial zero snapshots, deletion, missing receipts, persistent holds, approval absence, malformed/scalar contracts, original/safe-integer/bigint boundaries, concurrent JS clients sharing PGlite, lost ACK for a committed event and hold, and normal disk close/reopen in the same process.

The four pre-existing limits remain:

1. Cross-client logout/deletion during delayed acknowledgement cannot revoke already committed/returned results.
2. Expiry after claim commit but before acknowledgement delivery is not fenced.
3. Results inside an external BEGIN are not durable commit ACKs. A rollback test explicitly demonstrates the limit; an adapter must resolve only after its own transaction commit acknowledgement.
4. PGlite serializes one embedded database instance. Concurrent JS clients are not independent PostgreSQL sessions/processes, and no production PostgreSQL isolation/locking proof is claimed.

Disk verification is normal close/reopen in one process, not kill -9, host crash, process separation, WAL durability certification, or independent-server recovery. This work has no production UI or browser-flow change. Full application tests/build are owned by the integrating parent; local results are focused, not a full-app or deployment pass.
