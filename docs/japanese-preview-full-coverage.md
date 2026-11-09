# Full synthetic Japanese UI inspection

The existing protected Preview at `/api/qa/japanese` now includes a QA catalog for the actual 62 curriculum lessons, 20 reading lessons and 82 optional chunk lessons. These are 164 inspection entry points, not 164 independent courses. Product components/data and real account storage/sync remain unchanged.

## Lesson scope

- Select a lesson from the catalog. Curriculum, reading and chunk IDs come from the product data, not duplicated test content.
- Before opening new curriculum lessons, explicitly apply 20 minutes and starter/reader mode to expose every source question as a choice. This includes the former input-kind questions; it does not restore typing.
- Existing drafts keep their original duration, mode and answers. Changing QA defaults does not erase drafts, reviews, scores or the selected learning level.
- All records use this page's memory-only Storage/IDB adapters. Component re-entry is not persistent-storage verification. Refresh discards this synthetic session.
- The actual scoped language CSS and root tokens are reused, but the full application layout and decorative image resources are not loaded. This is not full application or character visual certification.

## Separate local voice probe

Ordinary lesson audio still uses the explicit failure adapter. A separate collapsed QA panel can inspect the browser's reported voice inventory and request one of three fixed, non-sensitive Japanese sample sentences only after explicit voice selection and a click.

- Only a uniquely identified voice reported as `localService === true` and `ja`/`ja-JP` is eligible. A default voice is allowed only when explicitly selected and otherwise eligible; there is no implicit default or remote fallback.
- The sample text, selected voice and one-request count are displayed. Revalidation, user activation, single-request busy state, cancellation and timeout are enforced.
- Start/end events and engine state are technical observations, not proof of audible output or pronunciation quality. The UI keeps actual listening marked unverified. A standalone probe result does not prove the lesson listening buttons work.
- No microphone, recording, speech recognition, pronunciation scoring, paid/server TTS, user text or external AI is connected. `localService` is browser-reported; CSP does not independently audit the OS synthesizer's network implementation.
- The route/branch gate and every CSP header remain unchanged, including opaque origin, `sandbox allow-scripts`, `connect-src 'none'` and `media-src 'none'`. Missing voices or sandbox denial are blockers, not reasons to install voices or relax protections.

## Build boundary

The sole native bridge is `scripts/japanese-preview/native-local-audio.ts`, pinned to SHA256 `26349084056f12dc53c84b1259fcd5203d57ad077ac45079ec1fba9fe60c25fe`. Other bundled inputs cannot reference native synthesis. The generated bundle must have exactly one native engine read and one utterance construction. All previous service/storage/external-resource checks remain enabled. Changing that bridge requires independent review and regression checks.

## Verification reporting

Record the exact commit, unit IDs, question counts, completed flows, interrupted/error paths and viewport dimensions. Distinguish browser viewport emulation from a physical mobile device, and component tests from actual browser actions. Do not report a selector inventory as every lesson completed, a synthesis event as listening, or synthetic memory as cloud synchronization. Existing old-server A-B-A/delete/cascade/reinsert limitations remain unresolved.

The preceding b91d0796 Preview was inspected in a real cloud browser for all 20 reading lessons (120 answer/save interactions and each comparison/completion flow). This expanded fixture must receive its own browser checks after the reviewed test-branch update. Production publication is outside this change.
