# Korean guided bridge and limited written consolidation — 2026-11-01

Base: 15afedee522e43e38f429fa83f2bd0038e0a1766. Cloud-only implementation; no real records or new external providers.

## Exact scope

- First12 guided lessons unchanged: desu, wa, desu-question, desu-negative, kore-sore-are, koko-soko-asoko, i-adjective, na-adjective, masu, wo, ni, de.
- Six existing IDs enriched: no-particle, mo-particle, nan, doko, masen, mashita.
- New ga-suki teaches only Nが好きです. Original ga-particle object/quiz/history is preserved as a reference; no old achievement is relabelled as this new goal.
- Guided19 total; beginner20 = guided19 + original ga-particle reference. Whole lesson dataset45 (previous44 +ga-suki). Other basic/practical references unchanged. These counts are not project progress or full curriculum completion.
- Bridge order: no-particle → mo-particle → nan → doko → masen → mashita → ga-suki. Each has Korean goal, context, vocabulary/readings/meaning, explanation, two worked examples with listening, recognition question, two original constructive tasks (14 total), reasoned feedback, no-help alternate retry and transient self-check.
- Separate consolidation2: a text-accessible imaginary map question (one input) and a two-line trip record (two inputs). These3 written prompts are not new grammar lessons and do not write a new mastery/proficiency score.

## Content and implementation

Parent-provided original Korean plan applied. Public Korean-provider/official references already reviewed: Darakwon's vocabulary→pattern→construction→application structure, YBM introductory progression, Siwonschool recall/hide-help interface, JF Seoul Irodori Korean grammar/context and Marugoto written sentence construction. No paid course copied, no provider endorsement or measured learning-efficacy claim.

Prior Japanese particle safeguards remain: Korean 을/를 does not imply を; likes use the explicitly requested Nが好きです construction, with context-sensitive は acknowledged rather than declared universally wrong. Given ます forms are transformed to ません/ました; no claim all dictionary-form conjugation has been taught. 何ですか's reading is scoped, not a universal rule for 何.

Only allowlisted normalized inputs appear in result/audio. Unknown answers receive example/target comparison, not a universal grammar-error claim. NFKC and outer whitespace are normalized; optional one final 。 applies to full-sentence tasks and ?/？ only to question tasks. Internal spaces and meaning-changing characters are retained. Consolidation accepts destinationに/へ with matching reading support. Kanji/kana variants are explicit. All vocabulary/feedback is local source; playback uses existing learning audio.

Existing grammarProgress IDs/schema/key and LanguageCloudSync remain. No migration, deletion or seeded records. Counters labelled selection-question history; not new writing mastery. Tests preserve old desu/ga-particle rows and account-specific snapshots. Supabase/auth/runtime services are unchanged and never contacted for QA.

Navigation separates first12, bridge7, consolidation2, and reference lists. Stage transitions stop audio and reset hidden filters; stage end offers explicit next-stage/review choices rather than modulo loop. Corrected pinned review items can advance to remaining wrong items. Multiple written inputs have unique label/radio identities; layout keeps sentence suffixes together on mobile.

## Validation and review

Focused29 checks passed. Aggregate1637 includes new tests discovered under app/data; final logs record the exact final run. Final typecheck/lint/build and diff check are recorded separately.

Synthetic Chromium covers all7 bridge recognition/writing/alternate tasks, empty/unknown/accepted inputs, hidden help, optional question punctuation, declaration-question rejection, no horizontal overflow at390px, desktop1280px, stage-end movement, remaining-wrong review, reload, original records, referencega isolation, consolidation inputs and independent self-check groups. Retained first12/kana/growth browser regressions run separately. Screenshots and JSON evidence accompany delivery. Mock playback dispatch is not actual device sound verification.

Independent scope_review identified and rechecked four issues: question punctuation allowed too broadly, next-review disappearance, shared accessible input names and tests outside aggregate discovery. All corrected. Reviewed canonical content/readings and import structure; no further source/content blocker. Initial CSS screenshot showed separated suffix/extra punctuation; final layout keeps suffix tokens whole and omits duplicated displayed punctuation for full-sentence inputs.

## Limits and remaining curriculum

No hosted authenticated record save, physical-device audio/stylus, real workbook or educational efficacy verification. User's prior visual acceptance does not validate these. Everyday/travel remains a bounded introduction: time, quantity, prices, existence, short requests and later HQ scheduling/material requests/thanks/completion messages are future work. Honorific/humble language, negotiation, conversation, recording, assessment, retired typing/drawing and external AI are outside scope.

Prior GitHub Actions and commit-status reads were Forbidden and must not be retried. Publication is inspection-branch normal fast-forward only after independent review and verified private backup; no main/production/manual deployment/security changes. Backup/push/automatic Preview results are separate from local verification.
