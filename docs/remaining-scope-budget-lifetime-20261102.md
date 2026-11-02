# Remaining-scope audit and expense-editor lifetime fix

Baseline: aa397c95c4be956944b96778ef9ee75811bd9cf6. 2026-11-02, cloud-only.

The provisional 20/25 ledger is not acceptance or completion evidence. Its five partial entries are not five established missing features. This audit does not change the denominator or percentage.

## Scope reconciliation

- Budget: `docs/budget-field-edit-verification.md`, `docs/free-first-progress.md`, and `history-screen.tsx` define expense editing. Income/savings bulk editing is explicitly excluded in existing documentation. The broader ledger phrase “existing history editing” does not establish a new requirement. No income/savings editor added.
- Exercise: `ExerciseMotionDemo.tsx` combines ordinary procedural players and staged routine/cooldown/roller players; `exerciseMotions` alone has 23 entries and is not the whole catalogue. `docs/exercise-motion/INTEGRATION-27.md` records the integrated 27 demonstrations. Dead-bug, recovery roller and AB preparation are excluded from the main motion entry; separately opened informational/static assets are not completed active demonstrations. No safety gate changed, no professional suitability or fresh hosted acceptance claimed.
- Photo: `oaReportParser.ts` includes strict date extraction and confidence/consensus gates. `inbodyReportParser.ts` supports confirmed English InBody270S labels and explicitly requires manual measurement-date verification; other layouts are not automatically supported. Extending date/layout recognition requires confirmed format evidence, not inferred dates. No photo or account record read in this audit.
- General AI: `AssistantClient.tsx` has a local body-conversation path. `/api/ai/free-advice` separately previews owner-scoped summaries, checks the preview fingerprint and calls the configured provider only through its consent/request flow. Source paths are implemented; current external-provider operation and advice quality were not retested. No external AI request or new transmission added.
- Reply speech/lipsync: `reply-plan.ts` creates presentation plans; `matchesReplyClip` requires exact text/language/voice matches and excludes synthetic-clock timelines. Saved sample playback is not fresh arbitrary-answer synthesis. New-answer voice/alignment remains a separate requirement subject to sentence/voice/count authorization; no new speech generated.

## Reproduced defect and change

Actual original CategoryEditor handlers failed two synthetic regressions: (1) unmount while authentication was pending still dispatched a save; (2) unmount after dispatch let a late success erase the reconciliation journal and refresh the obsolete view. Baseline: 4 passed, 2 failed.

An operation generation now invalidates the departing instance. Authentication completion cannot dispatch from that instance. An already dispatched request may still commit remotely; its owner-keyed journal is retained for explicit same-request reconciliation on remount. Late callbacks and detail reads cannot update the obsolete view. Existing user/filter React keys create fresh editor instances. This is not server cancellation or a new server-CAS guarantee. RPC/schema contracts and expense-only scope are unchanged.

Six focused handler tests pass. An independent source reviewer ran those six tests and found no blocker. Undo/forget and detail response paths received static review, not dedicated browser race coverage.

A standalone browser harness mounts the actual React editor with mocked auth/query/RPC and synthetic rows. It checks cancellation and confirmed save, auth-delay unmount, dispatched-response unmount, owner separation, and explicit reconciliation with the exact request UUID. External-origin requests: zero. This does not test a real account, hosted service, or actual mobile device. The 390px screenshot documents the fixture, not production styling acceptance.

## Timing and delivery

Work began 2026-11-02 03:06:45 UTC. Final verification timestamps and actual elapsed wall time belong in the delivery receipt; elapsed time includes tool/test waits and is not an estimate of human effort. No approval-blocked action occurred during local implementation. No ledger percentage is raised from test counts.
