# Disposable Auth and API persistence inspection

This lane tests real disposable GoTrue, PostgREST/RLS and the already compiled
`/api/transactions` route. It is HTTP/API inspection, never browser verification.
No product route, migration, RLS policy, dependency or stack-launch behavior changes.

## Entry point and placement

The existing automatic inspection workflow runs `node scripts/isolated-auth-api/supervisor.mjs`
after its existing build and Japanese HTTP check, only for `matrix.compiler == 'default'`.
Its push branch, repository predicate, permissions, runner, matrix, existing jobs,
Supabase CLI 2.117.0 and unconditional fixture teardown are unchanged. This adds no
workflow trigger, artifact, cache, deployment or provider call.

The supervisor first runs the synthetic safety suite privately. Only if that passes
does it run the dedicated real protocol runner. Both use the unchanged reviewed
`qa-private-orchestrator.mjs` for process-group cancellation, 1 MiB per-stream private
capture and redirection of all five GitHub command files. Its child environment is
allowlisted; inherited secrets, proxies, preload options and additional GitHub
command-file variables are excluded. A separate private report has a random token,
a 2 KiB maximum, an exact finite schema and bounded account counts. Public output is
reconstructed from fixed labels and numbers. Raw bodies, keys, credentials, IDs,
rows, error text and private paths are never forwarded. Reports explicitly say
`browserRun=false`. Nothing is uploaded or cached by this step.

## Preconditions and transport

Both executable entry points fail closed before network or file creation unless
`GITHUB_ACTIONS=true`, `YEONI_E2E=1`, the existing canonical runner temp directory is
`/home/runner/work/_temp`, and the event/ref match the existing inspection push.
The unchanged workflow supplies the repository restriction. The existing private
fixture file must be a regular, non-symlink 0600-style file of bounded size.
Its API URL must be exactly `http://127.0.0.1:54321`, and its anonymous JWT must match
the effective public environment key and have the anon role. Any nonempty publishable
key is rejected, matching the existing Next E2E guard. The service JWT must have the
service role. Hosted deployment variables and production `.env` files are rejected.
These checks are repeated after Next prepares.

Next binds only to loopback on an ephemeral port and serves only GET/POST/DELETE
`/api/transactions`. The request wrapper permits only that exact app origin/path
and the required local Auth/PostgREST paths/methods, rejects redirects and unexpected
response origins, caps requests and response bytes, and gives every request a
10-second deadline. The global wrapper also covers compiled route fetches and
rejects mismatched anonymous keys or service-role authorization in normal transport.
This is application-level fetch confinement, not a new network/security setting.

## Real scenarios, when the existing CI is later authorized to run

1. Generate exactly two random UUID/email/password/nonce account descriptors, with
   emails only under `example.test`. Create those explicit Auth IDs, then sign in
   with ordinary anonymous-key password clients and verify `getUser` identities.
2. For each of `user_app_state` and `language_user_state`, insert synthetic state,
   read it, conditional-update by the original timestamp, confirm persistence and
   reject a stale conditional write. User B cannot read/update/delete A's row, and
   inserting an A-owned row must specifically fail with RLS 403/42501. A re-reads the
   exact unchanged state after every negative probe; duplicate-key errors do not pass.
3. Exercise the compiled transaction route: unauthenticated 401, A POST/GET, a fresh
   anonymous-key client password re-login and subsequent transaction/state reads,
   B GET isolation, B DELETE of A's ID without deletion, and caller-supplied owner
   forgery. The existing POST overwrites that owner with B; the test checks B owns
   the resulting new row and A's original collection remains unchanged.
4. Sign out every created user session and verify local session removal. Do not
   assert immediate revocation of an issued access JWT.
5. Stop the local app, delete only attempted generated accounts, and verify both
   Auth absence and zero rows in the three tested tables under each generated ID.
   Admin capability exposes no list/unscoped query: only create, exact-ID ownership
   verification/deletion and scoped cleanup counts. Deletion requires the exact
   generated email and nonce, including after uncertain/partial creation. One
   cleanup failure does not skip the other account. Cleanup failure remains fatal;
   unchanged `always()` stack teardown is the final fallback.

The real protocol is not mocked. `safety.test.mjs` is a separate synthetic suite
with injected protocol/HTTP/process fixtures. It does not start Next, Auth or a DB.
An internal four-minute cancellation deadline leaves cleanup time before the
supervisor's eight-minute per-stage limit. Process termination/runner loss can still
prevent account-level cleanup; the unconditional full disposable-stack teardown
must remain in place. This lane cannot certify hosted behavior, browser rendering,
mobile flows, real-user sessions or operational deployment readiness.

## Local review and checks

Apply these staged files only to a separate local validation overlay. Do not invoke
the real entry point by spoofing CI variables. Run these from the overlay root:

- `node --test scripts/isolated-auth-api/safety.test.mjs`
- `node --test scripts/qa-private-orchestrator.test.mjs`
- `node node_modules/eslint/bin/eslint.js --max-warnings 0 scripts/isolated-auth-api/*.mjs`
- `node --check` on each new `.mjs` file.
- `node node_modules/typescript/bin/tsc --allowJs --checkJs false --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --strict false scripts/isolated-auth-api/boundary.mjs scripts/isolated-auth-api/adapters.mjs scripts/isolated-auth-api/report.mjs scripts/isolated-auth-api/scenarios.mjs scripts/isolated-auth-api/runner.mjs scripts/isolated-auth-api/supervisor.mjs`

All six production modules carry `@ts-check`; the focused command checks them while
not expanding to unchanged legacy JavaScript dependencies. This is not a full app
TypeScript check or build. No dependency installation is needed beyond the existing
checkout environment.

## Remote procedure after review and separate authorization

1. Verify the candidate manifest and diff against the supplied inspection baseline.
2. Preserve the private reviewed backup. Overlay exactly the staged files onto the
   existing inspection checkout, without changing product files or workflow scope.
3. Publish only to the existing inspection branch after the parent authorizes it.
   The unchanged push trigger runs the current workflow; do not add/dispatch a new
   workflow or deploy anything.
4. Require all existing jobs plus this default-only step to pass for the exact new
   commit. Expected new report: all six scenario labels passed, created=2,
   removed=2, cleanupVerified=true, browserRun=false, and overall passed.
5. A failed/missing report, interrupted process, cleanup uncertainty or unexpected
   request remains failed. Do not expose private raw logs or reinterpret an API
   pass as a browser pass. Retain the unconditional stack teardown.
