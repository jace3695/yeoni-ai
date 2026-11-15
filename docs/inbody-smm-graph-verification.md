# Narrow SMM graph-row recovery (2026-11-15)

Baseline: review commit `ba309ff275541661a2fcda673f7e10a2de83fa1d`. This is a separate SMM-only extension to the prior [PBF evidence](inbody-pbf-graph-verification.md); that document records its historical exact candidate. OCR versions/model, confidence 60, two-scale agreement, numeric ranges, date/source confirmation, owner and atomic-store guards are unchanged. BMI is deliberately not repaired.

## Evidence, not guessed values

The original synthetic graph's actual 1800-scale OCR contains `SMM (kg) 32.8`. Its 2100-scale OCR contains `SMM 32.8` and a separate, high-confidence `(kg)` word between those two words at the same vertical position. Both contain the immediately lower full `Skeletal Muscle Mass` label. The date-header variant shows the inverse whole/split-row arrangement. No missing digits, decimal point or unit is synthesized.

The new adapter accepts only a unique SMM abbreviation and full label inside unique Muscle-Fat Analysis / Obesity Analysis boundaries. Supporting lines and words must have confidence at least 60, coherent text and finite contained geometry. An inline row has exactly three words. A split row has exactly two and exactly one same-band, single-word literal `(kg)` fragment strictly between the abbreviation and value. The lines must overlap by at least 60% of each height; all three word spans must share at least 60% of each height. Oversized boxes, partial boundary crossings, detached or low-confidence units, duplicate/variant headings or labels, contradictory text, unknown context, history and other metric rows reject recovery. The full label must immediately follow the row with scale-relative spacing/alignment. The remaining section may contain only coherent right-hand numeric ticks before this row. Ticks never supply a value.

Derived provenance reconstructs `SMM Skeletal Muscle Mass (kg) 32.8` from these observed rows; it is not claimed as one literal OCR line. Both scales must independently identify the value with the unchanged final agreement checks. This intentionally narrow section does not promise recovery for arbitrary real layouts containing other muscle-fat rows.

## Actual fixed-model synthetic results

The same official pinned English `best_int` model and six hash-verified assets were used for fresh two-scale inference, separately from frozen-raw replay. The model's compressed SHA-256 remains `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`.

| Authored fixture | Baseline correct / 7 | SMM candidate correct / 7 | Incorrect values |
| --- | ---: | ---: | ---: |
| Original split graph/table | 5 | 6 | 0 |
| Date-header split graph/table | 3 | 4 | 0 |
| Explicit seven-row control | 7 | 7 | 0 |

The sole new value is printed SMM32.8kg. Detection on these fixtures is respectively85.7%,57.1%,100%; these are not population accuracy estimates. The clear-row control is not a manufacturer-standard layout. BMI remains unread because one observed unit is below confidence60 and another is not a literal valid unit. The date-header variant also still lacks weight/body-fat-mass words in its second-scale observation. Neither problem is filled from a different scale or from prior stored data. The original unsupported date label remains blank, while the valid date-header/control date is2025-11-24. Actual workers terminated.

## Actual component/browser scope

The real product component and default reader ran against the same-origin pinned assets and new PNG uploads, with no OCR result or reader injection. From an empty synthetic store the original graph produced six new values and blank BMI/date. Cancel left both stores empty. A separate date-header upload produced exactly four new values (SMM, PBF, FFM, BMR) with date2025-11-24; weight/body-fat-mass/BMI stayed blank. Saving was disabled before mandatory source review. After checking review, exactly those four values and four provenance entries were saved under that date and survived reload. Fixture cleanup left both stores empty. Two workers started and terminated, with four actual canvas draws at1800 and2100 widths.

This scoped browser run is not an authenticated-cloud, physical-mobile, native-full-suite or real-user-photo accuracy test. The updated native case retains existing-record decline, unrelated-record, review, provenance and narrow-layout assertions; changing its expectations alone does not prove it ran. Sampled console errors were browser-extension metadata messages, not evidence of product failure. No production deployment, paid service, real photograph or security setting was used.

## Regression boundaries

Focused tests include whole/split positive rows, strict unit confidence/text/geometry, duplicate and conflicting streams, section boundaries, intervening/adjacent content, missing or disagreeing second scale, scale/translation invariance, provenance and BMI non-recovery. Independent raw-observation perturbation checks cover15 adversarial rejections and3 positive coordinate variants. Full repository/CI outcomes must be associated with their exact candidate or commit, not inherited from the baseline.
