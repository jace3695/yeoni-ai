# Actual AssistantClient DOM lifetime verification

Base7a5ca2b3a399eb234ffba3b087318300add0ab10. Synthetic local work only.

The browser now mounts actual AssistantClient, its useTaskCommandDrafts hook, FreeAdvicePanel, and finishAdvice callback. No callback extraction or substitute component is used for these paths. Supabase auth/query/history and fetch APIs are synthetic; Next Link/Image are DOM adapters, unused dynamic character is stubbed with characterAudio absent. This is not full Next routing/AuthGate, real auth/RLS or provider acceptance. Local server serves only fixture bundle/style/public assets; attempted external requests are blocked and counted.

Initial6 flows passed but did not assert new-owner usability. Adding that assertion reproduced a defect: switching owners while finishAdvice awaited authentication removed the child panel but left adviceBusy true, locking the new-owner chat input. The unmounted child correctly ignored its late finally and therefore could not release parent busy state. Fix: reset adviceBusy in both existing owner-effect initialization and session/account invalidation paths. Do not use child cleanup to clear a potentially newer owner's request.

Final7 browser flows pass: chat auth wait→route unmount without API dispatch; cancel before analysis without history insert; advice auth wait→unmount without insert; owner switch prevents old insert/result and unlocks new input; already-dispatched insert late response after replacement-owner mount cannot alter visible result/error; normal mock history insertion and advice presentation; same-owner session invalidation unlocks input without old insert. Zero page errors and attempted external requests. Already-dispatched server writes cannot be cancelled/rolled back by this change. The earlier extracted handler tests remain separate evidence about suppressed setters.

Reusable harness: scripts/assistant-owner-lifecycle-local.mjs. Run from repo root with installed main and scripts/browser-qa dependencies; YEONI_QA_OUTPUT optionally sets the evidence output folder. Synthetic data only. Browser screenshot has actual component CSS modules but no generated global Tailwind utility stylesheet, so it is behavioral evidence rather than product layout acceptance.

Independent review, aggregate/type/lint/build results, exact candidate and elapsed/block time are in the delivery receipt. No new AI/TTS, actual health/finance records, DB/security/env or production work. Provisional20/25 unchanged.
