# Japanese reset replay receipt candidate

Local review candidate only. No hosted database, real account, CI run, publication, or deployment was used. This migration has not been applied outside disposable in-memory PGlite tests. The original reset migrations and the separate docs-only chunk guard remain unchanged.

## Behavior

The current historical RPC remembers only its latest request ID in `state.languageRecordResetV1`. A reset A followed by reset B, new learning, and a delayed retry of A currently deletes that new learning. The historical negative control in `tests/japanese-chunk-server-guard.test.ts` remains intact.

The new, separate migration adds `language_user_state.language_reset_receipts_v1`, a non-null JSON object defaulting to `{}`. Its entries map a canonical request UUID to the exact original reset marker. It is a separate column, never a key inside the synchronized `state` JSON.

For language resets only, the unchanged advisory lock and row lock cover state and receipt reads. Before any destructive change, the function validates receipt keys, values, timestamps, the current marker, and consistency between an existing current receipt and the marker.

- A recorded request whose receipt matches the current marker returns the original receipt, without an UPDATE.
- A recorded request whose receipt is no longer current raises `YEONI_RESET_REQUEST_SUPERSEDED` (SQLSTATE `22023`) before changing state, metadata, timestamps, or command history.
- The one current valid pre-upgrade marker can be recovered. Retrying it seeds metadata only, leaving `state` and `updated_at` unchanged. A new reset records that current historical marker and its own new receipt in the same update that clears the record keys.
- New requests keep every recorded receipt. There is no pruning or eviction. A future capacity limit must reject safely rather than forget old receipts.
- Malformed metadata or marker evidence fails closed with `YEONI_RESET_RECEIPTS_INVALID` (SQLSTATE `23514`). The column's CHECK separately rejects non-object JSON, and NOT NULL rejects SQL NULL.
- All other app branches, record-key lists, deletes, confirmation/authentication checks, function signature, owner, ACL, SECURITY INVOKER setting, and search path are preserved.

Ordinary SQL UPDATE and conflict UPSERT statements that name only `state` and `updated_at` preserve the separate metadata column. Tests compare exact returned state and prove no receipt is injected into `state`. Real PostgREST behavior still needs its own verification.

The client gives a specific superseded-request message and rejects a response marker for a different requested ID, even if remote readback matches that unrelated marker. These failures neither clear local records nor emit a reset event, write a success receipt, rotate the request ID, or retry automatically. Existing account/session checks and server readback checks remain in place. Any new destructive request still requires the existing explicit confirmation flow.

## Exact limits

This protects recorded future receipts and one recoverable current historical marker. It cannot reconstruct a pre-upgrade A already overwritten by B. A separate synthetic negative control explicitly demonstrates that unrecoverable old A can still be treated as a new reset after upgrading. A passing negative-control test is not evidence of protection.

This is correctness protection, not tamper resistance. Existing authenticated owner privileges permit explicit metadata changes and row deletion, which can remove evidence. No grants, RLS policies, access settings, or security mode were changed. Ordinary legacy whole-state writes can still erase or roll back learning state or its marker. The receipt column does not make those writes safe or provide universal old-client protection. No protocol-epoch change is included.

The ledger grows indefinitely. Large-ledger performance, storage cost, clock behavior under real concurrent processes, and production schema integration have not been accepted or measured.

## Local evidence

Added tests stay within the two existing reset test files; the baseline 343 test-file inventory is unchanged. Historical migration assertions remain unchanged.

The unguarded PGlite suite covers:

- A, B, new records, replay A with exact state/marker/receipt/`updated_at` preservation.
- Latest-request retries and a simulated lost response after commit.
- State-only UPDATE and UPSERT with exact state readback and surviving metadata.
- Historical-current receipt seeding, with unchanged synchronization timestamp and existing command history.
- New reset seeding both recoverable historical and new receipts.
- Explicit unrecoverable historical negative control.
- Installation rollback and reset rollback, including the real command-history trigger used by the disposable fixture.
- Table/function owner and ACL, RLS, policies, function signature/security/search-path snapshots before and after installation.
- Different owners reusing a UUID independently, cross-owner RLS denial, anonymous denial, missing authentication, and invalid confirmation.
- Malformed metadata/markers, object/NOT NULL constraints, empty/new owner rows, retained receipts, and unchanged non-language behavior with synthetic records.

A separate optional compatibility test installs the unchanged docs-only guard in a local fixture after applying the receipt candidate. The principal protection test does not depend on that guard. Neither the guard nor its trigger is promoted into this migration.

Client evidence executes the real reset helper in a mocked browser/SDK VM, plus a source contract for the unchanged panel's error path. This is not browser, Auth, HTTP, PostgREST, or multi-process concurrency proof.

## Required future isolated-stack verification

The current `scripts/e2e-stack.mjs` seeds the historical reset migrations only. In a separately reviewed and authorized disposable-stack change, append this new migration after `20261108132759_add_japanese_chunk_review_reset_key.sql`, retaining the existing schema/ACL setup. Do not use a real account or production database to validate it. No launcher or E2E configuration is changed by this candidate.

Before any release claim:

1. Verify schema-cache refresh and actual Supabase/PostgREST state-only PATCH and conflict UPSERT preserve receipts, including `Prefer`/missing-field behavior. Keep exact `state`/`updated_at` readback semantics.
2. Exercise A/B/new-learning/retry-A over real authenticated HTTP, latest retry, dropped response after commit, two independent owner sessions, and concurrent update/reset orders with real PostgreSQL locks.
3. Exercise the settings UI error path and manual retry with the original UUID, account changes, local records, reset events, and session receipts. Confirm no automatic UUID rotation or extra destructive RPC.
4. Verify reload, relogin, newer work, small-screen error copy, and both supported browser engines. Login-gate-only checks do not cover this.
5. Compare the actual isolated schema's owners, grants, policies, triggers, signature, and security mode before/after. Include the connector reset trigger and any other production-schema dependencies not present in this focused fixture.
6. Review migration/rollback operations and retained-ledger growth. Confirm the historical gap and remaining legacy-write risks are understood rather than marked solved.

No real-stack test, optimized-WASM performance acceptance, full-app type/build pass, browser pass, remote migration, or deployment is claimed by local focused checks.
