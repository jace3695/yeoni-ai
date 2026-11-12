# Japanese text learning and personal checklist candidate

Date: 2026-11-01. Base: `7f1057dfa0aaa01318e6db0f799be42e1101f497`.
Candidate branch: `agent/text-learning-checklist` in `/workspace/yeoni-simplified`.
The fetched inspection branch matched the supplied base exactly. The original
`/workspace/yeoni-ai` work branch at `62c2141` was not modified.

## Delivery preflight

This task uses local Git and files only. The parent can obtain a self-contained
patch, changed-source archive, complete test logs and screenshots from
`/workspace/yeoni-scope-delivery`; hashes are included in the final task result.
No Library upload/access is needed. No push, merge, deployment, live data write,
provider call, secret read, credential change or infrastructure change occurred.
The superseded iPhone MIME candidate was not used.

## Implementation

- Reuses existing kana, word, grammar, lesson quizzes, progress, and review data.
  Japanese home offers text-learning actions. Focused lessons use word → grammar
  → quiz stages; older speaking/dialogue drafts advance to the quiz. Historical
  fields/data remain. Conversation/recording/assessment entry pages render a
  safe retirement notice, and assessment/practice/conversation APIs return 410
  without auth, request body parsing or provider calls.
- Reference pronunciation listening remains in all four requested text areas.
  Kana/words/grammar reuse `useLearningAudio`: device Japanese TTS in existing
  FREE_MODE, stop/unmount cancellation, replay and visible failure messages.
  Main kana cards also support keyboard activation. No microphone needed.
- Typing and drawing pages (including typing/basics) become safe exit notices.
  Built-in retired routines and cached recommendations are filtered, without
  deleting their local/remote records. Ordinary text fields and the separate
  general assistant remain available.
- Growth reuses `growth_routines`, `growth_sessions`, `useGrowthData`, the
  existing AuthGate/account reset behavior, and account-filtered queries.
  Creates/edits custom activities with one or more weekdays; only scheduled
  activities enter the selected date's denominator. No default activities are
  seeded for a new empty account. Existing activities remain editable.
- Uses the existing local-date convention, refreshing today's date on focus and
  every second. The date picker is bounded to the loaded recent 90-day window.
  Archive is reversible `enabled=false`, not DELETE. Schedule edits do not
  change session dates. Desired completion state, a synchronous UI guard, the
  existing browser lock, deterministic owner/routine/date ID, and duplicate
  recovery prevent duplicate checks. Unchecking retains rows; a metrics marker
  permits restoring every original timed completion and its metrics on recheck.
  It does not invent elapsed time (new checklist rows have zero actual minutes).
- Existing 12-activity limit applies including archived activities. Older than
  90-day records remain stored but are not browsed in this bounded UI.

## Validation and review

Full unit/regression run before final two retirement checks: 1,620 passed.
Final aggregate, focused tests, typecheck, lint, build and diff check are recorded
in the delivery logs and final task result. Retired-route tests were updated to
assert safe retirement; backend security/parser/SQL tests remain, and speech
integration tests now call the retained backend factory rather than claiming
that the retired public route dispatches speech.

Independent native reviewer `scope_review` performed read-only source review
and independently ran 5 checklist tests. Findings fixed: reserved retired names
silently disappearing, restoration of multiple timed completion rows, stale
conversation settings/typing recommendations, date range validation, and
refresh errors hidden behind success messages. Final review found no additional
regression. This is separate from implementation self-review.

Actual Chromium component lab observations (synthetic client and synthesis):
390px create/check/reload/name+weekday edit/archive/restore/uncheck/reload;
one retained date row; failed write preserves state; committed write with failed
refresh shows the error and retry recovers saved state; no horizontal overflow;
1280px screenshot; safe retirement notice; Japanese hub/three learning pages;
hiragana and katakana reference buttons, word and grammar-example listening
request `ja-JP`, with zero microphone and external-origin requests. Screenshots
were visually inspected. This is not the full Next router or real Auth/RLS.

## Remaining gates

- Authenticated full-app QA on a disposable or authorized test account: real
  persistence/reload/account switch and history preservation. No live account
  or production database was used. Existing E2E launcher is GitHub-runner-only;
  local Supabase CLI discovery could not initialize its read-only home directory.
- Physical iPhone/Safari and actual Japanese voice audibility/quality. A device
  lacking Japanese voices should show the supported error; synthetic synthesis
  verifies wiring, not audible output. Playwright browser download returned 403
  from its CDN; installed Chromium was used instead, without bypassing access.
- Parent-coordinated backup/publication and user review. No deployed change is
  claimed. No old 34/36 completion denominator applies to this new scope.

## Acceptance checklist for hosted review

1. Learn hiragana, katakana, words and grammar, replay/stop reference listening;
   navigating away stops sound and no microphone permission appears.
2. No Japanese conversation/assessment menu or recorder; old URLs show exit
   guidance. Typing/drawing entries are absent, old records remain intact.
3. Create an activity, choose several weekdays, edit title/schedule, and see only
   scheduled activities counted for today (unscheduled days are not missed).
4. Check/uncheck, reload, archive/restore; prior dates and timed records remain;
   repeat rapid check requests do not duplicate rows and errors remain visible.
5. Verify account switch, local midnight/Sunday→Monday, mobile layout and the
   unrelated fitness/body/finance/assistant flows on the authorized test setup.

Local built Next HTTP smoke also returned `410 FEATURE_RETIRED` for POST to all
three retired APIs using malformed synthetic bodies. No authentication or
provider request is needed or performed by these handlers.
