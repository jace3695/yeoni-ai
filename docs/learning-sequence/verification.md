# Sequential kana and retained built-in learning — 2026-11-01

Base: 4bee6af462ea8ef985efdaff53b239fe2fcb780f. Cloud-only; source/synthetic records only.

## Findings and implementation

The previous visual check established shared shapes, not correct teaching animation. Each glyph owned a timer and both started together. KanaStrokeAnimation now loads the complete written unit and schedules every glyph's SVG stroke groups on one Web Animations origin and one replay timer. First glyph body and all dakuten/handakuten complete before the small following glyph. Existing SVG order is retained, not a newly invented circle direction. Dedicated small ya/yu/yo assets preserve their smaller/lower horizontal placement; the existing small-tsu fallback is reduced consistently in animated/static views. No sound/mora timing is used to drive writing.

Growth now has an always-visible built-in section: existing handwriting course, free handwriting, Japanese, exercise and private resources. Optional handwriting weekday scheduling is separate from feature access. Both handwriting saves accept the existing nullable routine_id when no activity exists, retaining source/owner/date/course metadata. Existing linked records continue using their existing routine. No routines are seeded on mount, no migrations, deletion or live data operations.

Grammar previously had explanations/examples/quizzes/rationales and recently gained focused tabs; this was not full curriculum validation. The twelve first-stage lessons now add original contextual gap-fill exercises, needed vocabulary, reasons, another example for retry, reference listening and self-reflection. Self-reflection is transient; existing quiz history is preserved and no mastery badge is inferred from one answer. Advanced content is not revalidated or advertised as a certified curriculum.

## Primary-source comparison

- Japan Foundation Irodori guide: https://www.irodori-online.jpf.go.jp/guide/ . Goal/context, needed language, understanding/noticing, use, summary and self-check inform the bounded text-only practice structure. Speaking/recording is deliberately outside the user's scope.
- Marugoto teaching Q&A: https://marugoto.jpf.go.jp/en/teacher/qateaching/ . Rikai addresses sentence patterns and constructing/understanding text; it can be separate where conversation is learned elsewhere. This supports separation, not a claim that this app is equivalent to that course.
- Marugoto course guide: https://www.marugoto-online.jp/info/sp/contents/ . Reading/writing, quiz and self-check used as comparison criteria. All added exercises are original short content, not reproduced course materials.
- Tokyo Board of Education handbook p183: https://www.spt.metro.tokyo.lg.jp/kyoiku/static/dbook/japanese/pageindices/index183.html . Distinguishes two written kana in yoon from one spoken mora. A single beat does not imply simultaneous handwriting.
- Gakken writing guidance, printed p12/file page1: https://www.gakken.jp/youjiw/pdf/other/nj_kokugo.pdf . Parent research visually verified dakuten last and left mark first. Finishing the first glyph before the next is our application of writing principles and the user's acceptance criterion, not a quotation about animation.
- Japan Foundation Memory Hint official description: https://www.jpf.go.jp/j/project/japanese/teach/tsushin/news/201508.html . Sound chart, character/reading and similar-character quizzes used as review criteria. Yeoni already has listening cards, roman-reading quizzes, confusing-pair exercises and writing modes. It does not reproduce the app's mnemonic illustrations or claim identical coverage/listening-only testing. Comparison apps were not installed or directly tested.

No source comparison establishes measured learning effectiveness or teacher certification.

## Validation

- 7 explicit timeline regressions cover both scripts, marked compounds, non-overlapping strokes and full replay boundary. Aggregate regression: 1,632 (see final-tests.log).
- Typecheck, full lint, build and diff check pass. Logs accompany delivery.
- Actual Chromium with synthetic adapters: six actual SVG/WAAPI timelines (きゃ, ぎゃ, ぴゅ, キャ, ギャ, ピョ), shared startTime, actual counts, second-letter delay greater than first-letter last stroke end; paused timing samples prove the second has no progress while first's final stroke is active. Paired screenshots and timing-proof.json included.
- 390/1280px built-in visibility, retired links absent, zero seeded routines; free-handwriting and course saves with routine_id=null and zero added routines. Course fixture is a generated synthetic image, not the private workbook. Grammar wrong/correct written feedback, alternative exercise resets, reflection and existing replay/listening/checklist regressions pass. Screenshots visually inspected. New bridge lesson flows and default12/supplement7 filters verified; final source wording screenshot included.
- Initial course fixture failed because synthetic-owner was not a valid UUID for existing material-path validation. Fixed the test identity, not product validation; final browser suite passes.
- Independent reviewer scope_review found no new blocking defect, reviewed nullable-schema ownership, per-glyph SVG references and shared timeline; independently ran 7 timeline checks. Later alternative exercise reset reviewed separately with no new defects.

## Boundaries

Synthetic lab is not hosted Auth/RLS, real account saving or physical-device audio/stylus QA. No real workbook, user records, provider calls, security change or production operation. Supabase changelog fetch was unavailable (web unsupported MIME; direct fetch 403); existing insert API docs and repository schema were reviewed, no SDK/schema change made. Prior denied GitHub Actions read is not retried. Backup/push/automatic Preview status must be recorded separately from local validation.

## Korean-first bounded path

Default guided sequence (12): desu, wa, desu-question, desu-negative, kore-sore-are, koko-soko-asoko, i-adjective, na-adjective, masu, wo, ni, de. Four original bridge lessons added. Each has Korean goal/context/vocabulary, explanation, worked examples/readings/listening, recognition check, original written gap-fill, rationale, alternate retry with help hidden and self-check. Kana perfection is not a prerequisite.

Separate beginner supplements (7): masen, mashita, ga-particle, no-particle, mo-particle, doko, nan. These retain reference explanations/examples/recognition questions, not the full guided construction flow. Total dataset44 includes other existing basic/practical references. Everyday/travel expansion followed by Japan HQ chat/mail is future curriculum, not implemented or validated here.

Korean comparisons explicitly qualify は/은는 and を/을를, with コーヒーが好きです contrast; context omission and polite endings vs honorific/humble distinction are explained. The named scope is first-stage practice, not complete proficiency or efficacy validation.

Representative Korean-source comparison: JF Seoul Korean guide https://www.jpf.or.kr/irodori/sData/pdf/starter/X_howto_kr.pdf and lesson3 https://www.jpf.or.kr/irodori/sData/pdf/starter/X_L03.pdf support Korean grammar explanation/context. Darakwon official https://www.darakwon.co.kr/books/detailProduct.asp?p_id=6342&pc_id_2=9&pc_id_3=52 and parent-reviewed public workbook support vocabulary→pattern→construction→application; YBM public list https://www.ybmbooks.com/reader/free_class_jap_new02_new.asp supports noun/adjective/verb prerequisites; Siwonschool public kana interface https://japan.siwonschool.com/?p=hiragana&s=free supports recall with help hidden. No paid lesson copying, videos watched claim, provider endorsement or measured efficacy. Parent's Pagoda indexed list and Hackers video-description review were limited secondary comparisons, not full course inspections.

Focused data test now verifies12 maps, unique44 IDs, valid answers and different alternate examples. Previous exact40 dataset assertion updated for4 actual additions. UI verifies12 default vs7 supplement options and4 new constructive tasks, hiding help on retry. Arbitrary minimum3 guide steps replaced by2 substantive steps; no filler content added to satisfy a count.

## Final answer-validity review

Parent independently scanned12 lessons/24 written exercises and found destinationへ and additional noun-negative forms were valid but unrecognized; also the distal demonstrative quiz needed both participants specified. Fixed に/へ, all four common polite nominal negatives, and おいしい/美味しい spelling; accepted input is retained in result/listening. Unrecognized input invites comparison with the example rather than asserting ungrammaticality. All prompts remain bounded to this lesson's forms, not an exhaustive Japanese-language grader. あれ question now explicitly states distance from both speaker and listener. Native independent reviewer rechecked24 prompts/component and passed19 focused tests; an additional distal-question regression makes final focused20. Existing0de8a75 backup retained unchanged; this revision needs its own backup verification before push.
