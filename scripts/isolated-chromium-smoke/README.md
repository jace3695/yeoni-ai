# Bounded Chromium application smoke

The default compiler's existing inspection job runs this lane after disposable
Auth/API inspection and before the unconditional stack teardown. It uses the
already compiled app and the existing disposable Supabase fixture. The webpack
matrix entry is unchanged. No deployment, new workflow trigger, artifact upload, cache, dependency, job limit
or repository permission changes. The receipt migration is appended only to the
disposable fixture initialization; tests/e2e/schema.sql stays unchanged. The exact unit inventory increases to 345 for
the separately integrated content and remaining-level-flow tests. Product changes remain separately reviewed.

## Exact coverage

The explicit CLI preserves six prior tests unchanged, includes the separately reviewed
fixed-settings baseline correction in the seventh receipt scenario, retains both bounded reading tests, and adds level-choice and overdue-review tests by source line:

- `auth.spec.ts:3`: login, logout, re-login and reload preserve 17 original keys
  without an unintended PATCH.
- `sync.spec.ts:3`: a real form save during a delayed initial GET survives
  conditional PATCH, confirmation GET, record display, reload and readback.
- `language-sync.spec.ts:8`: settings save, a newer edit during pending PATCH,
  database confirmation and re-login.
- `language-reset.spec.ts:39`: 320-pixel controls, cancel/reconfirm, real reset RPC,
  reload and re-login, with settings, the other owner and unrelated fitness retained.

- `japanese-answer-persistence.spec.ts:8`: enter free chunk practice through the real
  UI for the original upper-01 lesson and all six imported course-gap lessons.
  Answer each first meaning question and require a real conditional PATCH,
  confirmation GET and exactly seven distinct database events. The answer is marked as preparation-assisted,
  not independent mastery. Reload and re-login restore the saved result card and
  the same seven events, while original settings, a generic unrelated level record and
  fitness state remain unchanged. The test verifies local answer removal after
  logout before re-login. It does not seed an answer or invoke audio. Coverage is
  seven representative meaning answers; full reading-question and audio checks
  remain separate.

- `daily-review-completion.spec.ts:3`: review the first synthetic saved word twice,
  then a second distinct word, with no daily completion yet. A third distinct review
  must produce one daily review completion, visible local-save success, a hidden
  aria-hidden warning retaining its layout space and a disabled retry button.
  Real database confirmation, reload and re-login must preserve completedIds review,
  completedCount 1 and totalCount 5 without extra completion. No daily result is seeded.

- `language-reset-receipts.spec.ts:9`: require genuine PostgREST reset replay,
  concurrent same-ID requests, state-only PATCH and three SDK conflict UPSERT shapes.
  At 320px, lose committed A responses, complete B in a separate same-owner browser
  context, then save a real preparation-assisted chunk answer. Manual late-A retries
  must return the genuine superseded error without changing server or local records.
  Reload and re-login must restore B's answer; a second owner and anonymous caller
  must remain isolated. Holds and routes drain and extra contexts close before teardown.
  Concurrent HTTP observations do not prove deterministic database lock scheduling.

- `japanese-middle-reading.spec.ts:3`: use its own unchanged qa fixture to visit
  all three new intermediate lesson links and answer all 18 reading questions.
  The first lesson deliberately answers q2 incorrectly and q3 correctly with help.
- `japanese-upper-reading.spec.ts:3`: use a separate unchanged qa fixture to visit
  all three new advanced lesson links and answer all 18 reading questions correctly.

- `japanese-level-choice.spec.ts:3`: explicit level choice and preview backtracking preserve earlier records through save, reload and relogin.
- `japanese-due-review.spec.ts:3`: a synthetic overdue subset retains its queue and helped repeats without completing the full unit.

Both reading tests use `japanese-reading-flow.ts` to check the actual passage,
source-mapped choices, feedback, explanation, 24 passage-evidence and 12 transfer
panels in total, gated comparison/self-check and all six completion stamps. Each
completion first snapshots its expected journey from the UI/local save, then
requires matching authenticated DB readback, a real conditional PATCH and a later
confirmation GET. Reload and logout/relogin restore records and list badges, not
the question cursor. Selected level, unrelated language state, chunk absence and
fitness remain unchanged. Each first lesson uses 320 CSS pixels with overflow
checks and actual clicks. This is responsive Chromium, not a physical phone test.
Static answers verify source-to-UI mapping, not independent language quality.
The initial traversals contain 35 correct answers, one intentional wrong answer and
one help-assisted correct answer. Each flow then repeats one answer with help,
for 38 attempts across 36 distinct questions, without adding a completion stamp.
None is a learner mastery claim. No answer is
seeded in either complete reading traversal, no app save function is called directly, and no successful write is mocked.
No listening control is clicked. A zero-TTS request observer is supplemental only.

This is an explicit two-test subdivision of the proposed one-test 36-question
traversal: 18 questions and three lessons per unchanged 90-second test, with no
omitted question or raised timeout. Actual fit in the unchanged overall lane
remains unverified until a bounded run and fixture cleanup finish.

The receipt test uses two generated owners. These eleven tests use thirteen disposable accounts in total. The existing fixture handles
account creation, route draining, browser closure, deletion and scoped zero-row
checks. Passing requires completion of all test teardown assertions. Interrupted
or failed teardown is not certified. The existing unconditional disposable stack
stop remains the final fallback.

The standalone configuration contains only the `chromium-app-smoke` project,
without project dependencies. It does not import the full browser configuration,
call `qa-playwright.mjs`, or change any WebKit library requirement. This is a real
Chromium-only application check, not WebKit, iPhone or production certification.

## Limits and privacy

The supervisor repeats the existing strict Actions push/ref, disposable loopback,
anonymous-key and fixture-file checks before any installation or browser action.
The workflow retains its repository restriction. Only the lockfile-installed
Playwright 1.63.0 CLI installs Chromium's headless shell and official dependencies,
using `install --with-deps --only-shell chromium`, including its standard ffmpeg
helper. There is one wrapper invocation, without an added retry loop, mirror, proxy
override, forced reinstall, extra browser or custom cache. The unmodified installer
may use its built-in recovery across official download URLs within the same
four-minute deadline. Playwright test retries remain zero.

Safety, install and browser stages have 60, 240 and 465 second ceilings. A total
775-second abort deadline reserves five seconds for process-group termination
within 13 minutes. The existing 45-minute build job limit is unchanged. One worker,
zero retries, 90-second tests, 15-second assertions/actions and 30-second navigation
limits remain explicit. Next starts on loopback port 3000 with a 120-second ready
limit and cannot reuse an existing server. Traces, screenshots and video are off.

The existing private orchestrator captures at most 1 MiB from each raw stream and
redirects all five GitHub command files. New directories/files are owner-only.
The child environment is allowlisted, excluding provider secrets, proxies,
preload options and service-role variables. The service key stays in the existing
private fixture file. Nothing from the raw logs, legacy fixture reports, titles,
rows, URLs, credentials, errors or DOM is forwarded to public output.

The private diagnostic channel has a fresh random token, bounded reads, no-follow
file access and an exact schema. Acceptance requires one completed invocation,
the eleven exact source coordinates with project ID 5, eleven passed tests and zero
skips, failures, unknown outcomes, active tests or runner errors. Missing, stale,
partial, duplicate, malformed or oversized reports fail closed, even with exit 0.
Existing project IDs are unchanged. Public output contains fixed labels and
validated numeric diagnostics only. A success names Chromium and fixture teardown;
a failure leaves real-browser completion and fixture cleanup unverified.

The existing fixture blocks external browser origins. This is not a universal
server-side network sandbox. No paid generation or TTS is requested by these tests.

## Local checks

The safety suite uses synthetic reports, child processes and list-only test
collection. It does not start a browser, Auth, a database or the app server. Run `node --test scripts/isolated-chromium-smoke/safety.test.mjs` and
`node --test scripts/qa-private-orchestrator.test.mjs`, plus focused lint, syntax and
type checks. These are distinct from real browser execution. The integrated content and remaining-level-flow tests bring the exact unit inventory
to 345. This integration preserves six prior browser tests and every product
component. The seventh receipt scenario includes the separately reviewed fixed-settings
baseline correction. Focused synthetic/list-only checks are not browser execution.

Before publishing to the inspection branch, review the exact diff and preserve a
private backup. Require the existing workflow and this bounded lane to pass on the
same commit. Do not reinterpret a local synthetic pass as application verification.

The receipt fixture adds only the reviewed replay-receipt migration after the two
existing reset migrations. Its guard removes exactly that single append line before
checking the unchanged launcher baseline hash. The schema.sql source, grants, policies, optional
docs guard and fixture source remain unchanged. Source IDs 1–50 remain stable. Level-choice and overdue-review specs append IDs 51 and 52, respectively, both at line 3, column 5. Unknown pre-upgrade requests, destructive legacy writes,
metadata tampering, hosted rollout and ledger performance remain outside this lane.

Reading-specific scope, nonclaims and pending admission are recorded in
`docs/japanese-reading-browser-verification.md`.

Six explicitly awaited literal test.step callbacks per reading spec retain
spec-owned setup, lesson 1/2/3, immediate repeat and restoration phase locations while helper
assertion details remain subject to the unchanged same-spec privacy guard.
The safety suite exercises all twelve phase-failure cases with a fixtureless native
runner and checks that no helper/error/label content reaches numeric output.

The level-choice and overdue-review specs and their shared state helper are
strictly pinned separately. Eleven additional offline helper-failure injections
check each new literal phase's original source line. These coordinate fixtures
replace application bodies and do not certify application behavior.
