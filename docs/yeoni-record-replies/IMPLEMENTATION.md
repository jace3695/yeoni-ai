# Record-triggered generated reply preparation

This candidate is an intentionally **disabled production integration**, with a runnable synthetic reference service and response view. It does not claim that live generated advice, persistent AI caching or multi-server quotas are operational.

## Product contract
- Per authenticated account and app, analyze only when original saved record content changes (add/edit/delete). Opening the app, route, selected day, clock, analysis window or prompt version alone must not call a provider.
- Content SHA-256 is separate from generatedAt and analysisDate. Original saved record dates are content; wall-clock dates are not fingerprint inputs. Preserve meaningful array order and named source keys.
- Show generated time and source analysis date on cached answers, explicitly distinguish a prior snapshot from current advice. No automatic audio. Listen requires an explicit action; workout timer/session narration is out of scope and unchanged.
- Natural evidence-based analysis, empathy, a manageable action and encouragement, without fixed proportions. Never infer feelings, activity absence, diagnoses or mastery from missing records.
- Firm language concerns evidenced behavior, never the person. Require distinct comparable periods, consistent currency, adequate completeness and user-set goals before repeated-budget caution. Increased expense alone, essential/exceptional expenses and unknown income changes do not justify blame or automatic cuts.
- Safety takes precedence for recorded risk signals. No diagnoses, prescriptions, medication changes, excessive exercise, restriction or fasting advice. Real model safety/evidence validation is a release prerequisite, not something the prompt alone proves.

## Current production behavior
`POST /api/yeoni/record-reply` always503 before body, auth, keys, records or provider access. No env var, request flag, model setting or cached answer can enable it. It imports no provider. Existing guides identify themselves as rule summaries; disabled listening does not create TTS. There is no URL-based mock mode, auth bypass or mock backend in the product.
Local fitness/diet/language snapshots use named persisted source keys after existing owner/readiness guards. Budget/growth/assistant preview source descriptions are marked incomplete: budget needs all-month budget revisions, growth uses rolling sessions, assistant uses a loaded task view. They are not eligible to generate even in a future adapter until server source revision exists. Other growth guides show the same disabled status. Removed portraits remain removed.
The mock view is imported by the isolated QA bundle only; production never instantiates its mock service. It marks fixed simulated text explicitly and shows a silent mock-listen control, not a real TTS claim.

## Cache, concurrency and cost contract
MockReplyLedger is a reference single-instance ledger for tests, not durable storage. Two service clients sharing that ledger deduplicate account/app/content, reserve against an account-wide cap, suppress older observations and invalidate the old session/display on owner logout while retaining owner-scoped cached replies. In-flight records are copied before awaiting. Same content can be reused across date changes and reopening a service instance sharing the ledger. Closing the process loses this reference cache: cross-relaunch persistence is NOT implemented.
Reservations remain charged conservatively for stale results, timeouts, invalid response parsing and uncertain finalization. Only a typed definitely-not-sent failure releases a reservation, without automatic retry. Client cancellation does not imply provider cancellation. Successful results retain the maximum reserved cost until future trusted reconciliation.
A live implementation must provide a server-authenticated durable ledger with a unique(owner,app,recordVersion) constraint and an atomic account-budget reservation transaction. It must obtain the current whole-source version from authorized server records, not client IDs/hashes. Record writes and version increments/deletions must be atomic; finalization must compare current source/owner version and keep uncertain reservations on failure. Do not use this mock Map as multi-tab/server enforcement. No DB migration, permissions or infrastructure change is included.

## Existing route audit
- New path has no calls to existing `/api/ai/free-advice`, `/api/analyze`, `/api/tts`, language TTS or photo analysis.
- `/api/analyze` FREE_MODE local path and paid ai-router assert remain unchanged.
- Existing free-advice is manual confirmation + dedicated free settings; existing Zephyr reading is click-only + server configuration/reservation. No new automatic invocation was added. The existing workout session speech remains unchanged.
- Existing ai-router cancels its reservation in generic catch and usage-finalization failures may only log. This remains a known old-path limitation and is NOT reused or declared fixed by this candidate. Before live generated replies, uncertain provider charges must never be refunded by this route.

## Decisions required before real connection
1. Provider/model, applicable pricing and data handling/retention terms; no provider selected here.
2. Explicit consent for which per-app records may leave the app, health-data handling and minimization; default is none.
3. User targets are AI analysis7,000KRW/month and voice3,000KRW/month, separately. Still decide billing timezone/reset period, actual pricing/tax/FX upper bounds and reconciliation policy; these targets do not authorize paid calls.
4. Approved durable cache/ledger location and retention/deletion policy, server source-version implementation and privacy review.
5. Voice provider/voice/data consent and cost cap separately, while retaining click-only playback.
6. Model-specific groundedness/safety evaluation with synthetic edge cases before real records or release. Prompt checks alone do not establish medical safety.

## Confirmed monthly targets and simulation
The user selected analysis7,000KRW and voice3,000KRW monthly targets. The budgeted mock entry point `createQuotedMockReplyService` validates the quote before invoking its service (generic service unit fixtures use abstract cost units). Mock budget pools keep20% planning headroom (5,600/2,400KRW spendable), require an all-in upper estimate, then add10% estimate reserve and round upward. These are conservative simulation assumptions, not agreed provider prices or an absolute invoice guarantee. Real FX, taxes, billing lag, maximum output and uncertain responses require reconciliation. Missing quote blocks. Pools never borrow from each other. The reference ledger does not automatically reset at midnight/month boundary or release unresolved charges. A durable monthly rollover and multi-server transaction implementation are still prerequisites, not completed features.

## Session lifetime versus explicit deletion (mock-only revision)
`invalidate(owner)` advances the session epoch only. Already completed owner/app/content replies remain reusable after the same owner logs back in, without a second generation/reservation. A request finishing after logout returns `stale` to the old session; if no deletion occurred, its exact-version result can be cached for a future authenticated session of that same owner. Another owner never shares the key. The future live adapter must authenticate owner server-side; this mock is not an auth mechanism.
`purge(owner, app)` is a separate explicit cache/source-deletion operation. It advances a cache epoch, invalidates the observation, removes text, and keeps receipt tombstones plus reserved charges. Pending responses cannot repopulate purged cache. Restoring an already-purged content version returns `deleted`, not the old answer and not an automatic paid retry. A genuinely new version can be analyzed under the usual mock budget. A future approved deletion adapter must invoke this operation for explicit source/cache deletion; it is not wired to real user storage here. Ordinary source change retains previous exact-version cache unless explicit deletion is requested. No reset/refund, durable storage, cross-process enforcement or live provider integration is added by this revision.
