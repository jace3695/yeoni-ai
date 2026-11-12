# Learning follow-up — 2026-11-01

Base: 1847f916661ffa4059b3872148e4409dc72600ff. Cloud-only candidate, no real records read or written.

## Findings and changes

- Kana writing used different SVG/PNG/font glyphs, surfaces, padding and 340/420px heights. Demo, tracing and faint modes now share the same SVG source/viewBox, square responsive white board, border and central guides. Static guides use the SVG shadow geometry; per-instance IDs keep clip paths independent. Load failures are visible. Existing stroke animation, drawing, clear and navigation remain.
- Grammar already had explanations, examples, quizzes and rationales. Its weakness was a long list of expanded cards, unexplained beginner terminology and ignored choice reading/ruby metadata. It now offers one selected lesson with explanation → worked example → practice → rationale/retry/next, browsable filters and wrong-answer review. Eight existing introductory lessons gain Korean explanations, word meanings, worked construction and hints. Choice ruby is rendered. Existing lesson IDs/progress keys and reference listening remain; no conversation or evaluation was restored.
- The previous simplification accidentally removed the growth homepage handwriting entry. The existing 53-lesson Korean handwriting course and free practice were still present. Both entry points are restored. New accounts can explicitly register a handwriting-category activity using the existing editor/weekday selection; ordinary custom activities remain. The free page explains missing activity setup. No default reseeding, migrations, deletion, remote storage changes or new handwriting subsystem.

## Checks

- Aggregate regression: 1,622 tests passed (counts are tests, not project completion).
- TypeScript, whole-project lint, production build and diff whitespace checks passed; final command results in delivery logs.
- Actual installed Chromium at 390px and 1280px with synthetic client only: kana glyph geometry equality, both scripts, compound/small kana, pointer and CDP touch drawing, clear, next/mode transitions; focused grammar stages, ruby, hints, wrong-answer reload/review, feedback retention and retry; handwriting activity category creation, existing course list opening, free canvas drawing/undo/redo. Screenshots inspected; no JS page errors. Private workbook fixture intentionally unavailable, so the original course shows its material-unavailable flow.
- Independent reviewer scope_review found two related grammar state issues: a fallback review lesson lost feedback after a correct answer, then retry removed the retained lesson. Both fixed with actual selection plus separately pinned lesson; browser regression covers wa-only wrong → correct → retry → correct. Final read-only review found no further source defects.
- Initial browser attempts stopped on duplicate '쓰기 보기' selector and ruby-influenced accessible names. Selectors corrected; final run passed. These were harness failures, not claimed successful runs.

## Limits

Synthetic component lab is not full Next/Auth/RLS or real hosted persistence. No private workbook/user records accessed, no real handwriting upload, no actual device/audio verification. Existing course data/private material boundaries retained. Physical phone/tablet and authenticated account save remain unverified. Previously denied GitHub Actions listing is not retried. Automatic Preview success, if reported later, is deployment status only.
