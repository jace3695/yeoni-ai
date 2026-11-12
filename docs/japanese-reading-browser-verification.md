# Bounded new reading-question verification

This candidate adds two new real-UI reading scenarios, not a completed browser
result. Six earlier scenarios are unchanged; the seventh receipt scenario has
the separately reviewed fixed-settings baseline correction. The lane becomes exactly nine tests;
source IDs 1–48 remain unchanged and IDs 49/50 identify the two new specs at line
3, column 5, project 5. The unit-file inventory remains 344. The only workflow edit
is its descriptive step name from seven to nine; triggers, permissions, jobs,
commands, compiler matrix, teardown, artifact policy and all ceilings are unchanged.

## Complete intended traversal

- Intermediate: middle-core-01/02/03, six questions per lesson, 18 total.
- Advanced: upper-core-01/02/03, six questions per lesson, 18 total.
- The tests use separate existing disposable qa fixtures. They deliberately split
  the earlier proposed single 36-question test into two bounded 18-question tests.
- Each scenario uses actual list links, title/purpose/Japanese passage, all choices,
  selected/correct feedback, disabled choices, explanation, all evidence panels,
  optional expression comparison, sample, self-check gate and three completion
  stamps. First-lesson controls are actually used at 320 CSS pixels with document
  overflow checks. This is not physical-phone or WebKit certification.
- Intermediate first-lesson q2 is intentionally wrong and q3 is help-assisted
  correct. All other answers are independently correct according to the static
  source. Combined outcomes are 35 correct, 1 intentional wrong and 1 helped
  correct, with 24 passage-evidence and 12 new-situation panels. This checks
  source-to-UI consistency, not independent Japanese correctness or learner skill.
- Each answer must have its exact ID, one attempt, bounded real timestamp, distinct
  session/question identity, one-day interval, appropriate success dates and help
  flag. Each lesson has one session prefix; prefixes differ between lessons.
- A read-only local snapshot defines every completed lesson's expected full state
  BEFORE DB polling. Exact account-authenticated DB readback and real conditional
  PATCH/later delivered confirmation GET are required at all six completions.
  Local acknowledgement alone is not accepted as cloud persistence.
- Records and completion badges must survive reload and logout/relogin. The
  underlying journey, not the prior question cursor/feedback, is restored.
  Selected beginner level, absent selection clock, preserved synthetic unit,
  unrelated language keys, absent chunk-review key and full fitness state stay
  unchanged. Only an empty journey with one unrelated synthetic stamp is seeded,
  before login. No answer, app saver call or mock-successful write is used.

## Limits and safety

90 seconds/test, 15 seconds/assertion/action, 30 seconds/navigation, 120 seconds
Next readiness, 465 seconds/browser stage, 775 seconds supervisor plus 5 seconds
termination reserve, 45 minutes/job, one worker and zero retries are unchanged.
An incomplete or over-budget traversal fails; no timeout increase, skipped tests,
retry conversion or narrowed coverage is allowed. Runtime feasibility is unknown.

Only the isolated CI loopback app and real disposable Auth/PostgREST/Postgres
fixture are eligible. Existing fixture, cleanup, schema, dependency pins,
allowlisted child environment, strict origin guards and private-output/media
policies are unchanged. The observer requires zero same-origin TTS requests but
is not a server-side network sandbox. No listening/audio control, external
provider, real account/record, production target, new permission or cost is used.
No new workflow or artifact upload is introduced.

## Evidence status and excluded scope

The baseline seventh receipt-flow run failed while the six earlier flows passed;
that result is not a green baseline or evidence for these reading tests. This candidate was rebased onto the reviewed diagnostic-only commit
`759e2a37d98991937afcb610a66a30957f254851` (tree
`314f149b3eab845f3709b269bcf3281b4438dd26`). Its actual seven-flow retry failed in the receipt scenario before the new
post-reset answer and late-reset retries. It is not a green baseline. The numeric failure bridge is preserved; no receipt
product fix is implied. Further receipt changes require another reconciliation. Local synthetic,
source, strict-type, lint and list-only results must remain separate from the
future exact-commit real browser execution and cleanup result.

No browser, app server or database was started for candidate preparation. Full
build and all 344 unit files were not rerun here. Do not call this runtime-verified,
ready for operating deployment, or complete Japanese curriculum verification.

Still outside these two flows: initial-help variants, reading save-error/retry,
interrupted/duplicate clicks, due-only queues, repeat-session spacing, concurrent
same-question conflicts, other viewport/engine/physical device behavior, audio or
microphone quality, hosted migration parity, actual user data, independent
linguistic review, learning effectiveness, writing ability and complete curricula.

The shared reading helper is not a new public source ID. Five literal, explicitly
awaited test.step callbacks in each spec identify setup, lesson 1/2/3 and
restoration at lines 5/7/8/9/11. The unchanged same-spec numeric failure policy
can omit the helper's precise assertion/API coordinates but retains the actual
outer spec phase. A fixtureless native failure control covers all five phases in
both specs: five invocations, ten intentional helper failures, numeric phase
coordinates retained and no message/label content leaked. It executes no reading
UI, browser, server or DB and is not runtime reading evidence.
