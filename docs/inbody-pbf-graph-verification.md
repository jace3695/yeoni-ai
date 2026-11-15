# Narrow PBF graph-row recovery (2026-11-15)

This candidate is based on review commit `1d12aec48c794d0f9b17464ad75e1b42c76ffdec`. It does not change the OCR engine, fixed model, confidence cutoff, two-scale agreement, units/ranges, date requirements, save confirmation, storage ownership or atomic-writing boundary.

## Accepted evidence and rejection

Only one actual OCR row already containing `PBF (%)` and a single decimal value can be paired with its immediately lower `Percent Body Fat` label. Unique verified Obesity Analysis and Body Composition History headings bound the section. Supporting rows and words must have confidence at least 60, coherent text streams and finite contained geometry. The adjacent label supplies meaning only, never a missing unit or number.

Ambiguity checks retain rows crossing either horizontal boundary, case variants, word-stream conflicts, uncertain duplicate headings and duplicate/conflicting field evidence. Unknown context remains a barrier. Prior graph ticks are not measurements: low tick confidence does not supply a value, but contradictory line/word text or detached geometry rejects recovery. SMM and BMI are deliberately not recovered from detached units, incorrect unit text or insufficient confidence.

PBF provenance reconstructs text from the two verified rows (`PBF Percent Body Fat (%) 21.9` in the invented fixture); it is not claimed as one literal OCR line. No digits, decimal points or units are repaired or inferred.

## Actual fixed-model synthetic comparison

The unchanged official English `best_int` model was verified against compressed SHA-256 `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`. Each authored PNG was independently recognized at two scales. The same frozen raw observations were also replayed through old/new parsers, separately from fresh inference.

| Authored fixture | Baseline correct / 7 | Candidate correct / 7 | Incorrect values |
| --- | ---: | ---: | ---: |
| Original split table/graph | 4 | 5 | 0 |
| Date-header split table/graph | 2 | 3 | 0 |
| Explicit seven-row control | 7 | 7 | 0 |

The sole additional graph value is the printed PBF 21.9%. The clear-row control is **not a manufacturer-standard layout**. These three synthetic cases do not establish general or personal-photo accuracy. In the date-header graph, weight/body-fat-mass words remain absent from the second-scale raw OCR; this adapter does not invent them. No user photo, manufacturer example measurement, external OCR service or paid call was used.

## Actual browser and remaining scope

The actual product component and default reader ran in an isolated same-origin preview with all six hash-verified worker/core/model assets. No OCR text, confidence, results or reader implementation were injected. From an empty synthetic store, the original graph produced five new values, left SMM/BMI blank and left its unsupported date label blank. Cancel preserved the empty store. Native date-key edits revoked review; checking review on a future date still did not enable saving. Explicit past-date confirmation saved five values with five provenance entries; rendered storage readback after reload matched exactly. Both real workers terminated, four real canvas draws were observed, and fixture cleanup left both stores empty.

The browser tool's date `fill` displayed a DOM value without updating the React draft in this session. No save occurred through that path; native ArrowUp/ArrowDown was used and checked separately. A first readiness wait and a summary-role locator also timed out; fresh visible state established completion and the correct control without repeating an upload or save.

The native browser regression case now expects five observed fields and preserves invalid-image/ratio, worker/asset, review, existing-record decline, unrelated-record, source, reload and narrow-layout checks. Updating those assertions is not evidence that the entire native case was executed locally. This scoped browser run is not authenticated cloud persistence, a physical mobile test, a real-user report benchmark or whole B3 completion. No production deployment or security setting changed.

## Local candidate checks

The final parser passed 29 focused tests, including regressions for independently found boundary-crossing, case-variant conflict and contradictory-context failures. The whole existing inventory remained 359 files and passed 3434 tests (no skips). Full TypeScript and ESLint passed with zero errors; two unrelated pre-existing hook warnings remain. Default Turbopack and webpack builds both passed on the first final run, followed by all three existing QA HTTP checks for each build. Independent source and evidence reviews found no remaining blocker. These local results do not pre-claim a later remote CI run.
