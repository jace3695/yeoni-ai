# A02 assistant lifetime audit

Baseline2f4fc7630183d76bf9accaedf32451bece01c03d. Cloud-only synthetic verification; no actual account records or provider requests.

## Supported paths and user-facing boundaries

`localBodyConversation.ts` identifies body-composition questions before the general-chat request. The local path builds a rule-based narrative, labels it local, does not generate speech, and excludes local/history-only body content from remote history. Ambiguous follow-ups remain local unless the user explicitly returns to general chat or uses a recognized ordinary query. Explicit optional history/archive saving is separate from the local narrative computation; “no automatic permanent save” must not be interpreted as removing those user-directed controls. This is not medical assessment or complete external AI analysis.

FreeAdvicePanel mounts without a request. User-requested preview loads a summary through the existing server path; this is not zero network in actual use. Provider analysis requires a preview, configured provider and explicit data-use acknowledgment. The server independently checks acknowledgment and the current summary fingerprint. Questions and allowed summary metrics may be sent only through the existing requested analysis path; no new transmission is introduced here.

## Reproduced defect and minimal correction

The actual finishAdvice handler and actual owner-effect cleanup were executed with deferred synthetic auth/insert. Baseline4 tests:2 passed,2 failed. Unmount during authentication still initiated a history insert; unmount after dispatch still ran late result UI effects. Cleanup now increments existing chat epoch/send ID to invalidate old asynchronous work. Current completion and owner-change rejection remain supported.

This does not cancel or undo a history insert already sent to the server. No RPC/schema, provider policy, supported conversation scope or voice generation changed.

## Verification and limits

Four focused lifetime tests cover before/after dispatch, current success and account mismatch. Combined lifetime/local-body/free-advice synthetic tests32/32 pass; independent reviewer separately ran32/32 and found no blocker. Independent review did not include browser or real provider/account testing.

Actual React FreeAdvicePanel browser fixture with mocked auth/fetch/voice verifies initial zero calls, preview-only before consent, consent-qualified analysis, identity change clearing result/preview/consent, late old-owner response rejection, unmount abort and clean remount. External-origin requests0. It does not prove server cancellation, hosted RLS, real provider quality, physical-device behavior or production styling. Separate extracted actual handlers verify the changed parent callback; the whole AssistantClient route was not mounted in this browser fixture.

C02 remains outside this change. Follow-up requires exact approved text, chosen voice/language and call count, confirmed provider/cost/quota boundary and an authorized audio/alignment validation plan. A saved matching sample and a presentation plan do not constitute arbitrary new-answer speech/lipsync. No generation was attempted.

Final aggregate/type/lint/build results and actual elapsed/block time are recorded in the delivery verification receipt. No progress percentage changes from this audit or test counts.
