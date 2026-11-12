# Reference-page fixture extension, 2026-11-09

## Scope

The existing protected `/api/qa/japanese` fixture now mounts the actual kana, words and grammar pages. No new site, production route permission, deployment, remote push or account access was performed by this change. Only `scripts/japanese-preview`, related tests and this documentation were edited for the extension.

The three product page files were edited separately for product corrections and are not replaced by test replicas. Real `KanaStrokeAnimation` and `WritingPracticePad` components are included in the fixture. The existing catalog still contains 62 curriculum, 20 reading and 82 chunk entry points; the three reference pages do not change those counts.

## Isolation review

- The branch gate, Route Handler, CSP and pinned native local-audio bridge remain byte-identical to baseline `77eecc19`.
- `sandbox allow-scripts`, opaque origin, `connect-src 'none'`, `media-src 'none'`, `img-src 'none'`, memory-only storage and forbidden-input checks remain in place. The existing compiled `fetch(` guard was not removed or weakened.
- Bare/window/globalThis/self `fetch` identifiers and calls resolve to the injected `qaAssetRequest`. Only exact string `/kana-strokes.json` with no options is accepted. A fresh minimal `{ ok, json }` response contains a copy of the build-time JSON. URL/Request objects, alternate paths, fragments, queries and all supplied options, including GET/POST/HEAD, are rejected. There is no native fallback.
- The public 160-glyph JSON is pinned to SHA256 `32ba7a804d8ba53958f18c7a9a00db59d24f14df16a5501683deffce152e211c`. Missing, duplicate, renamed or changed inputs fail closed. Tests inspect vector tags and local fragment-only references. The JSON and adapters are included in the generated source manifest.
- The auth-header adapter always throws. The original auth-header/app Supabase sources are forbidden inputs. Ordinary lesson audio still throws through the previous audio adapter; the separate native audio bridge was not edited.
- Only kana/words/grammar paths were added. Words receives a hash-only router `push`. The JSX adapter normalizes ordinary `<a>` elements, preserves other props/handlers, and removes popup/download/ping attributes. Unsupported application and external reference links remain inside the fixture.

## Completed technical checks

`node --experimental-strip-types --test tests/japanese-preview-*.test.ts tests/japanese-local-audio-probe.test.ts`: **55 passed, 0 failed**.

The eight new reference tests cover exact asset bytes and response shape, rejected request forms/methods, all four native-name aliases without accessing native request objects, asset pin failure cases, throw-only auth, plain anchor normalization, router boundaries, actual grammar memory write failure/same-answer retry/double-click protection, and actual kana/word writing component exposure with disabled AI feedback.

Focused lint of `scripts/japanese-preview` and changed preview tests: **passed with no findings**.

The isolation test rebuilt the full fixture successfully. At this checkpoint it included 159 bundle inputs (161 source-manifest entries including the build script and lockfile), with JavaScript 1,841,560 bytes and CSS 46,208 bytes. Source digest: `4247a6c1a7e125e1686aa912868f79d8e910bee6dcd0d0d4e090152e1501e830`. Payload SHA256: `d14ea24d1d7d958cac8fb750a6654171f796feb7c779d72b600f0a43057b6488`. Later integration edits require a fresh build digest.

## Not completed by this worker

An initial full type check ended with `Killed`; the cause was not established. Other workers reported concurrent full checks. Final integrated type checks, full tests and Next builds are assigned to the parent for sequential execution rather than repeated here.

These are build/static/VM component results, not a real-browser or actual SVG animation/canvas interaction result. The known cloud browser launch permission failure was not retried or bypassed. No Windows transfer was attempted. Browser checks still need to cover actual glyph rendering and animation, handwriting pointers, reference filters/quiz routes, grammar failure/retry, Back/Forward and small-screen layout in the authorized protected fixture. No claim is made about real account persistence, cloud sync, paid AI, microphone, pronunciation, OS audio output or physical devices.


## CSP-safe glyph presentation follow-up

Independent review identified that SVG `style` attributes imported through DOMParser/importNode may be rejected by the unchanged hash-only CSP. The QA stylesheet now supplies exactly two scoped group rules: `.language-app-shell svg > g[data-strokesvg="shadows"]` and the corresponding `strokes` group. These duplicate the original assets' fill/stroke/width/linecap values; no public asset, product component, animation timeline or CSP was changed.

All 160 assets were enumerated. Each contains exactly one shadows style `fill:var(--shadow,#ccc)` and one strokes style `stroke:var(--stroke,#000);fill:none;stroke-width:128;stroke-linecap:round`. The only remaining style attributes are 464 legacy `--i:0..5` metadata entries. The actual product component does not read `--i`; it uses `timeline.characters[characterIndex].starts[strokeIndex]` and Web Animations.

The new regression test compares every group declaration with the scoped CSS, checks that groups are direct SVG children, allows only the known remaining metadata and rejects URL/import/important/animation/transition rules. Reference-focused tests now pass **9/9**. No full type check or Next build was repeated for this follow-up. The earlier generated source digest is historical and must be refreshed by the parent's integration build. Actual rendering and two-character sequential animation remain browser verification tasks.
