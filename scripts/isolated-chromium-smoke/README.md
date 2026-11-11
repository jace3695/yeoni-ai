# Bounded pinned Playwright Chromium application smoke

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

The receipt test uses two generated owners. These thirteen tests use fifteen disposable accounts in total. The existing fixture handles
account creation, route draining, browser closure, deletion and scoped zero-row
checks. Passing requires completion of all test teardown assertions. Interrupted
or failed teardown is not certified. The existing unconditional disposable stack
stop remains the final fallback.

The standalone configuration contains only the `chromium-app-smoke` project,
without project dependencies. It does not import the full browser configuration,
call `qa-playwright.mjs`, or change any WebKit library requirement. This project
uses Playwright 1.63.0's pinned Chromium headless shell, revision 1243, browser
version 153.0.8010.12. The channel is deliberately absent: `channel: chromium`
would select full Chromium, while `channel: chrome` would select system Chrome.
No custom executable, launch arguments, sandbox settings or remote browser is used.
This is PINNED PLAYWRIGHT CHROMIUM, distinct from SYSTEM GOOGLE CHROME
156.0.8078.79, WebKit, a physical iPhone or production certification.

## Limits and privacy

The supervisor repeats the existing strict Actions push/ref, disposable loopback,
anonymous-key and fixture-file checks before readiness or browser work. It retains
the exact official GitHub-hosted Linux/X64 `ubuntu24` image `20261101.360.1` and
repository allowlist. Unknown images require separate review. The pinned image's
exact CHROME_BIN and SELENIUM_JAR_PATH inventory defaults are tolerated at raw
entry only, then dropped. Other browser/loader overrides, including npm aliases,
are rejected. A fixed PLAYWRIGHT_BROWSERS_PATH is injected only after admission;
the exact PLAYWRIGHT_TEST=1 marker set by Playwright 1.63.0 before worker config
reload is accepted only in this sanitized config context. Raw supervisor admission
still rejects that marker, and the fixed installer/validator environment never
receives it. Wrong values, case variants and npm aliases remain rejected. This
marker selects no executable, address, permission or browser option. In addition,
caller-supplied paths, skip-validation flags, proxies and preload options are not
forwarded to the installer/validator child. The browser receives the same fixed
cache path through the existing allowlisted stage environment.

Stage 02 creates a new owner-only directory at the fixed runner temporary location
`/home/runner/work/_temp/yeoni-chromium-1-63`. It refuses a preexisting location,
never repairs permissions and does not borrow an installation-complete or
validation marker as evidence. It runs the installed official Playwright CLI as
`node <playwright-core>/cli.js install --only-shell chromium --no-remove`.
This downloads the pinned headless shell and ffmpeg revision 1011. Unlike older
apt-based runs, it never requests `--with-deps`, `install-deps`, apt or sudo.
The no-remove option prevents browser-cache garbage collection. No new workflow,
job, persistent cache or artifact upload is added. The directory remains within
the disposable job until runner disposal; a successful probe does not certify
independent cache deletion or cleanup of escaped descendants.

A zero installer exit alone is not readiness: Playwright 1.63.0 prints host
validation failures as warnings, can reuse a recent DEPENDENCIES_VALIDATED marker,
and its shell descriptor names `chrome-linux` rather than the actual
`chrome-headless-shell-linux64` directory. The route therefore pins the installed
package/CLI/browser-descriptor/core source hashes and exact runtime registry
identities, versions, URLs and official supported host. After installation it
requires real owner-owned, non-group/world-writable bundle trees without symlinks,
nonempty regular executable files and the expected installation markers.

The enforced dependency check inspects the actual shell directory, requires the
main executable in a bounded nonempty candidate set and validates dynamic
ELF64/x86-64 headers before checking each executable/shared library with fixed
`/usr/bin/ldd`. Only the known shell directory is supplied as LD_LIBRARY_PATH.
Each command is bounded; nonzero exit, signal, timeout, spawn failure, stderr,
empty/malformed/ambiguous output and missing-library records all stop readiness.
Only recognized missing-library records are reported as missing dependencies;
command failures and malformed output have separate fixed categories. A normal
missing-library failure may emit one numeric missingLibrary ID: 1–92 maps to the
fixed MISSING_LIBRARIES dictionary in bundled-driver.mjs, copied from the pinned
Ubuntu24 lib2package map; 0 means an unmapped name was present. It identifies at
most the lowest recognized ID in the first failing ldd result, not every missing
requirement. No name is inferred from a nonzero command, stderr or timeout. No raw
library names, paths, output or errors are emitted.

The unchanged pinned official registry method then performs host validation on
the actual shell directory, directly rather than through its skip/cache wrapper.
Its rejection fails the stage. The driver checks source/tree identities and the
candidate set again afterward. The fixed source pins and runtime ABI checks make
this private API dependency explicit; an upstream change fails closed and needs
review. The installer may write a validation marker, but this route never reads
it as proof. ffmpeg's pinned installation identity is checked; its no-op native
validator is not represented as shared-library readiness. Video remains disabled.
This readiness stage does not launch a browser or prove the thirteen app flows.
Real launch, runtime dependencies/resources and all flow assertions remain stage
03 evidence. Missing host requirements stop rather than trigger installation,
system-Chrome fallback, security changes or a validation bypass.

A caught pre-stage failure emits a closed admission category before the failure
summary: fixture, private-mode, signal-handlers, child-environment, runner-context,
context-request, context-runner, context-image, context-repository,
context-override or unexpected. An escaped failure after supervisor handoff is
labeled supervisor/unexpected. These categories contain no raw environment,
paths, messages or exceptions and do not invent stage or launch evidence.
Installer and native validator output are discarded. Readiness exposes fixed
engine/revision/version fields only on success, or a closed failure category.
The prior system-Chrome metadata probe and its tests are recoverably removed
from this route; their published sources, frozen reports and private backups
remain separate evidence of the rejected writable `/opt` path. This route never
executes that rejected image binary and does not relax its trust checks.

Official background: https://playwright.dev/docs/browsers
The installed Playwright 1.63.0 source is the exact implementation contract.

After the driver leader closes, readiness probes that child's owned process group.
Only an initially absent group can accompany a successful driver exit. Any
unexpected member forces readiness failure, even if subsequent termination works.
The route attempts TERM, waits no longer than the existing five-second grace
inside the stage budget, then attempts KILL and makes a final bounded probe.
Denied or uncertain observations remain unverified. When outer timeout or
cancellation begins, the route keeps its work pending until the unchanged outer
KILL fence settles, so early leader close cannot cancel that fence. The additional
ownedGroup diagnostic contains only fixed observation/attempt categories and
always says processCleanup=unverified. Group disappearance does not prove that
escaped or privileged descendants stopped; a signal syscall alone proves neither
absence nor fixture cleanup. No OS setting or shared production lifecycle changes.

Safety, readiness and browser stages retain 60, 240 and 465 second budgets. Private
preparation and finalization now share each stage budget. The first interruption
attempts process-group TERM, then KILL after the existing five-second grace;
the runner releases its owned capture pipes and settles failure even if a
descendant holds them open. Repeated aborts do not renew that grace. The total
775-second abort deadline also has an independent five-second failure fence,
within the existing 13-minute allowance. These are runner settlement bounds,
not proof that escaped or privileged descendants have stopped. An unresponsive
event loop or underlying operating system is not controlled by a JavaScript timer.
The existing 45-minute build job limit is unchanged. One worker,
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
the thirteen exact source coordinates with project ID 5, thirteen passed tests and zero
skips, failures, unknown outcomes, active tests or runner errors. Missing, stale,
partial, duplicate, malformed or oversized reports fail closed, even with exit 0.
Existing project IDs are unchanged. Public output contains fixed labels and
validated numeric diagnostics only. A success names playwright-chromium-headless-shell and fixture teardown;
a failure leaves real-browser completion and fixture cleanup unverified.

Only readiness stage-02 emits the separate `lifecycle` line. Legacy
`stage-NN passed/failed/not-run` lines and the browser diagnostic journal schema
are unchanged. The new line contains an allowlisted reason, bounded leader exit
code/signal, monotonic elapsed/exit/close milliseconds, a duration-cap flag,
leader observation, capture status, and finite TERM/KILL attempt outcomes.
Unknown code/time is -1 and unknown signal is 0. Time fields cap at 780000 with
`durationCapped=1` when needed. Actual leader exit and pipe closure are separate.
It always states `processCleanup=unverified`; forced pipe release states
`capture=abandoned`. A successful signal syscall never certifies descendant
cleanup. No raw probe output, messages, stacks, paths, URLs, environment, or
credentials are included. Missing observations are not reconstructed.

The existing fixture blocks external browser origins. This is not a universal
server-side network sandbox. No paid generation or TTS is requested by these tests.

## Local checks

The safety suite uses synthetic reports, child processes and list-only test
collection. A separate finite fixtureless worker check imports the actual config
and lets Playwright set its own marker before worker reload, with webServer
disabled and no browser/page/context/qa fixtures requested. Collection alone
cannot prove that worker-entry contract. It includes six finite synthetic native-process cases for inner timeout, outer
timeout, cancellation, nonzero exit, capture overflow and zero exit with a survivor.
Only those lightweight helper waits overlap; all actual browser work remains one
worker. Helpers ignore TERM, have finite lifetimes, and receive finally cleanup
using PID/start-time identity checks. No running helper or false cleanup claim is
accepted. It does not start a browser, Auth, a database or the app server. Run `node --test scripts/isolated-chromium-smoke/safety.test.mjs` and
`node --test scripts/qa-private-orchestrator.test.mjs`, plus focused lint, syntax and
type checks. These are distinct from real browser execution. The integrated content and remaining-level-flow tests bring the exact unit inventory
to 345. This integration preserves all eleven prior browser bodies and overlays only the independently reviewed thirteen-file curriculum preservation repair. The seventh receipt scenario includes the separately reviewed fixed-settings
baseline correction. Focused synthetic/list-only checks are not browser execution.

Before publishing to the inspection branch, review the exact diff and preserve a
private backup. Require the existing workflow and this bounded lane to pass on the
same commit. Do not reinterpret a local synthetic pass as application verification.

The receipt fixture adds only the reviewed replay-receipt migration after the two
existing reset migrations. Its guard removes exactly that single append line before
checking the unchanged launcher baseline hash. The schema.sql source, grants, policies, optional
docs guard and fixture source remain unchanged. Source IDs 1–52 remain stable. Level-choice and overdue-review specs append IDs 51 and 52, respectively, both at line 3, column 5. Unknown pre-upgrade requests, destructive legacy writes,
metadata tampering, hosted rollout and ledger performance remain outside this lane.

Reading-specific scope, nonclaims and pending admission are recorded in
`docs/japanese-reading-browser-verification.md`.

Six explicitly awaited literal test.step callbacks per reading spec retain
spec-owned setup, lesson 1/2/3, immediate repeat and restoration phase locations while helper
assertion details remain subject to the unchanged same-spec privacy guard.
The safety suite exercises all twelve phase-failure cases with a fixtureless native
runner and checks that no helper/error/label content reaches numeric output.

The level-choice and overdue-review specs and their shared state helper are
strictly pinned separately. Eleven existing offline helper-failure injections
check each new literal phase's original source line. These coordinate fixtures
replace application bodies and do not certify application behavior.

## Curriculum preservation and terminal completion candidate

- `curriculum-corruption.spec.ts:3` (source 53): start with synthetic prior f01 history, an old special-key draft and review sentinel. Real UI answers create a pending f12 draft. Explicit local malformed-JSON fault injection then blocks finish/autosave, preserves exact bytes and the whole remote snapshot, and never reports completion or server success. Normal mount, reread, reload and invalid-shape input remain blocked. Explicit known-valid local fixture correction, not implicit repair, allows a genuine track-choice save with conditional PATCH, confirmation GET and authenticated DB readback. The existing focus-triggered sync callback is exercised; the full 30-second timer interval is not awaited.
- `curriculum-terminal.spec.ts:3` (source 54): open actual f12, traverse all expression and pattern screens, answer the normal five-minute three-question meaning path, save, reload/relogin, repeat in a new UI session, then explicitly select intermediate. Both completions require distinct actual session IDs, new timestamped attempt history, exact local/remote preservation and real conditional PATCH plus subsequent GET/DB confirmation. Five minutes is the chosen lesson-size setting, not a five-minute wall-clock wait.

Both new tests use the unchanged fixture, real Auth/DB replies, cleanup and external-origin guard. No successful network reply is faked. Historical synthetic f01 results are not new learning evidence. The corruption test's only direct local storage writer is explicitly labeled fault injection/correction. New outcomes are never seeded. TTS requests must remain zero. Literal test.step phases stay in the owning specs and their numeric attribution has fixtureless controls. Source IDs 53/54 are append-only; earlier definitions and coordinates stay intact.

The complete safety commands are independently derived from both workflow supervisors: `node --test scripts/isolated-auth-api/safety.test.mjs` and `node --test scripts/isolated-chromium-smoke/safety.test.mjs`. The latter includes actual list-only collection and all native fixtureless phase checks. It does not run test bodies, a browser, app server, Auth, database, installer or network. Unit inventory remains 345; all test/time/resource ceilings stay unchanged. The prior system-Chrome route is replaced by the distinct fail-closed pinned-bundle installation and enforced host-validation route, with no OS dependency installation.

This candidate does not add browser evidence for corrupt remote rows, key-specific storage read failure, all six reader entry points, stale Kana owner/epoch permutations, overflow extensions, or corrupt-local newer-reset recovery. Those remain synthetic-only repair coverage. Existing genuine reset/receipt scenarios remain byte-identical but do not cover corrupt-local reset recovery. Actual browser timing, execution, same-commit CI and cleanup remain unverified until an authorized bounded run. No audio, physical-device, whole-curriculum, hosted-data or deployment claim is made.
