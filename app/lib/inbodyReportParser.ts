import type { BodyMetricSources } from '../data/recordStorage';
import type { OaReportResult } from './oaReportParser';
import type { ImageLike, Worker } from 'tesseract.js';

/** Public InBody270S English result-sheet labels, not private measurements. */
export const INBODY_270S_INVENTORY = [
  ['weight', 'Weight', 'kg'],
  ['skeletalMuscleMass', 'Skeletal Muscle Mass', 'kg'],
  ['bodyFatMass', 'Body Fat Mass', 'kg'],
  ['bodyFatPercent', 'Percent Body Fat', '%'],
  ['bmi', 'Body Mass Index', 'kg/m²'],
  ['fatFreeMass', 'Fat Free Mass', 'kg'],
  ['basalMetabolicRate', 'Basal Metabolic Rate', 'kcal'],
] as const;
type MetricKey = typeof INBODY_270S_INVENTORY[number][0];
export type InbodyOcrLine = { text: string; confidence: number };
type Box = { x0: number; y0: number; x1: number; y1: number };
export type InbodyLayoutLine = InbodyOcrLine & { bbox: Box; words: (InbodyOcrLine & { bbox: Box })[] };
type Section = 'composition' | 'muscle' | 'obesity' | 'research';
type Field = { key: MetricKey; section: Section; label: RegExp; unit: RegExp; min: number; max: number; decimal?: boolean };
const FIELDS: Field[] = [
  { key: 'weight', section: 'composition', label: /^(?:Sum of the above\s+)?Weight\b/i, unit: /^kg$/i, min: 20, max: 300, decimal: true },
  { key: 'bodyFatMass', section: 'composition', label: /^(?:For storing excess energy\s+)?Body Fat Mass\b/i, unit: /^kg$/i, min: .1, max: 150, decimal: true },
  { key: 'skeletalMuscleMass', section: 'muscle', label: /^(?:SMM\s+)?Skeletal Muscle Mass\b/i, unit: /^kg$/i, min: .1, max: 200, decimal: true },
  { key: 'bodyFatPercent', section: 'obesity', label: /^(?:PBF\s+)?Percent Body Fat\b/i, unit: /^%$/, min: 1, max: 80, decimal: true },
  { key: 'bmi', section: 'obesity', label: /^(?:BMI\s+)?Body Mass Index\b/i, unit: /^kg\/m(?:2|²)$/i, min: 5, max: 80, decimal: true },
  { key: 'fatFreeMass', section: 'research', label: /^Fat Free Mass\b/i, unit: /^kg$/i, min: 10, max: 250, decimal: true },
  { key: 'basalMetabolicRate', section: 'research', label: /^Basal Metabolic Rate\b/i, unit: /^kcal$/i, min: 500, max: 5000 },
];
const SECTIONS: [RegExp, Section][] = [
  [/^(?:\d+\s+)?Body Composition Analysis$/i, 'composition'],
  [/^(?:\d+\s+)?Muscle-Fat Analysis$/i, 'muscle'],
  [/^(?:\d+\s+)?Obesity Analysis$/i, 'obesity'],
  [/^(?:\d+\s+)?Research Parameters$/i, 'research'],
];
const EXCLUDED_SECTION = /^(?:\d+\s+)?(?:Body Composition History|Segmental (?:Lean|Fat) Analysis|Weight Control|InBody Score|Whole Body Phase Angle|Waist-Hip Ratio|Visceral Fat Level|Calorie Expenditure of Exercise|Impedance)\b/i;
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
const UNSTORED_COMPOSITION_ROW = /^(?:(?:Total amount of water in body\s+)?Total Body Water\s+\(L\)|(?:For building muscles\s+)?Protein\s+\(kg\)|(?:For strengthening bones\s+)?Minerals\s+\(kg\))\s+\d+(?:\.\d+)?(?:\s*\(\s*\d+(?:\.\d+)?\s*[~–-]\s*\d+(?:\.\d+)?\s*\))?$/i;

const DATE_LABEL = /\bTest Date & Time\b/i;
const DATE_OCCURRENCES = /\bTest Date & Time\b/gi;
const OTHER_DATE_CONTEXT = /\b(?:date|birth|birthday|DOB|print|printed|printing|issue|issued|generate|generated|history)\b/i;
const confident = (confidence: number) => Number.isFinite(confidence) && confidence >= 60;

/** Never infer US/European order. Preserve the original token for cross-read agreement. */
function measurementDate(lines: readonly InbodyOcrLine[]) {
  const labels = lines.map((line, index) => ({ ...line, index })).filter(line => DATE_LABEL.test(line.text));
  if (labels.length !== 1) return undefined;
  const line = labels[0];
  if (!confident(line.confidence) || lines.slice(0, line.index).some(line =>
    SECTIONS.some(([pattern]) => pattern.test(line.text)) || EXCLUDED_SECTION.test(line.text))) return undefined;
  const match = line.text.match(/^Test Date & Time\s*:?\s+(\d{4}([-/.])\d{2}\2\d{2}|\d{2}([-/.])\d{2}\3\d{4})(?: ([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/i);
  if (!match) return undefined;
  const token = match[1], parts = token.split(/[-/.]/).map(Number);
  let year: number, month: number, day: number;
  if (/^\d{4}/.test(token)) [year, month, day] = parts;
  else {
    year = parts[2];
    if (parts[0] > 12 && parts[1] <= 12) [day, month] = parts;
    else if (parts[1] > 12 && parts[0] <= 12) [month, day] = parts;
    else return undefined;
  }
  const date = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  const parsed = new Date(date + 'T00:00:00Z');
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  if (year < 2000 || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today) return undefined;
  return { date, token };
}

/** Official label is above its own date/time column, before composition analysis.
 * Do not borrow a neighboring identity/date column or an arbitrary subsequent line. */
function headerDateLine(lines: readonly InbodyLayoutLine[], bodyTop: number): InbodyOcrLine[] {
  // OCR may merge several columns into ONE line. Count phrases, not lines,
  // in both representations before cropping any column or discarding context.
  const textStream = lines.map(line => normalize(line.text)).join(' ');
  const wordStream = normalize(lines.flatMap(line => line.words).map(word => word.text).join(' '));
  if ((textStream.match(DATE_OCCURRENCES) || []).length !== 1
    || (wordStream.match(DATE_OCCURRENCES) || []).length !== 1) return [];
  // Fail closed on competing date meanings anywhere in the header, even if
  // their label is left/right of the candidate or split into another OCR block.
  // Legitimate unfamiliar header layouts remain available for manual entry.
  const header = lines.filter(line => line.bbox.y0 < bodyTop);
  const context = normalize(header.flatMap(line => [line.text, ...line.words.map(word => word.text)]).join(' '));
  if (OTHER_DATE_CONTEXT.test(context.replace(DATE_OCCURRENCES, ''))) return [];
  const labels = lines.filter(line => DATE_LABEL.test(normalize(line.text)));
  if (labels.length !== 1) return [];
  const label = labels[0];
  const words = [...label.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const start = words.findIndex((word, i) => words.slice(i, i + 4).map(w => w.text).join(' ') === 'Test Date & Time');
  if (start < 0 || !confident(label.confidence)) return [];
  const heading = words.slice(start, start + 4);
  if (!heading.every(word => confident(word.confidence))) return [];
  const box = { x0: heading[0].bbox.x0, x1: heading[3].bbox.x1,
    y0: Math.min(...heading.map(word => word.bbox.y0)), y1: Math.max(...heading.map(word => word.bbox.y1)) };
  const height = box.y1 - box.y0;
  if (height <= 0 || box.y1 >= bodyTop) return [];
  const below = lines.flatMap(line => line.words).filter(word => word.bbox.y0 >= box.y1
    && word.bbox.y1 < bodyTop && word.bbox.y0 <= box.y1 + height * 3
    && word.bbox.x0 >= box.x0 - height * .5 && word.bbox.x0 <= box.x1 + height * 3);
  if (!below.length || !below.every(word => confident(word.confidence))) return [];
  // One visible row only, including time; multiple rows are ambiguous even if equal.
  if (Math.min(...below.map(word => word.bbox.y1)) <= Math.max(...below.map(word => word.bbox.y0))) return [];
  const text = 'Test Date & Time: ' + below.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(word => word.text).join(' ');
  return [{ text, confidence: Math.min(label.confidence, ...heading.map(word => word.confidence), ...below.map(word => word.confidence)) }];
}

/** A narrow graph exception: one real OCR row already contains PBF, its unit
 * and a single current value. The immediately lower full label verifies only
 * the meaning, never supplies a unit/number. Keep original rows (and therefore
 * duplicate/conflict evidence); do not relax the ordinary text parser. */
function verifiedBodyFatPercentGraphRow(lines: readonly InbodyLayoutLine[], leftEdge: number, rightEdge: number): InbodyOcrLine[] {
  const boxIsValid = (box: Box) => Object.values(box).every(value => Number.isFinite(value) && value >= 0)
    && box.x1 > box.x0 && box.y1 > box.y0;
  if (lines.some(line => !boxIsValid(line.bbox))) return [];
  const coherentLine = (line: InbodyLayoutLine) => line.words.length > 0
    && normalize(line.words.map(word => word.text).join(' ')) === normalize(line.text)
    && line.words.every((word, index) => boxIsValid(word.bbox)
      && word.bbox.x0 >= line.bbox.x0 && word.bbox.x1 <= line.bbox.x1
      && word.bbox.y0 >= line.bbox.y0 && word.bbox.y1 <= line.bbox.y1
      && (index === 0 || word.bbox.x0 >= line.words[index - 1].bbox.x1));
  const exactLine = (line: InbodyLayoutLine) => coherentLine(line) && confident(line.confidence)
    && line.words.every(word => confident(word.confidence));
  const heading = (text: string) => {
    // A second uncertain occurrence is still ambiguous, not discarded evidence.
    const pattern = new RegExp(`^(?:\\d+\\s+)?${text}$`, 'i');
    const matches = lines.filter(line => pattern.test(normalize(line.text))
      || pattern.test(normalize(line.words.map(word => word.text).join(' '))));
    return matches.length === 1 && normalize(matches[0].text) === text && exactLine(matches[0]) ? matches[0] : undefined;
  };
  const start = heading('Obesity Analysis'), end = heading('Body Composition History');
  if (!start || !end || end.bbox.y0 <= start.bbox.y1
    || Math.abs(start.bbox.x0 - end.bbox.x0) > Math.min(start.bbox.y1 - start.bbox.y0, end.bbox.y1 - end.bbox.y0)
    || [start, end].some(line => line.bbox.x0 < leftEdge || line.bbox.x1 >= rightEdge)) return [];
  // Include any horizontal overlap: crossing a boundary is ambiguity, not
  // permission to discard an excluded heading or conflicting PBF observation.
  const leftLines = lines.filter(line => line.bbox.x1 > leftEdge && line.bbox.x0 < rightEdge);
  const overlapsSection = (line: InbodyLayoutLine) => line.bbox.y1 > start.bbox.y1 && line.bbox.y0 < end.bbox.y0;
  const inSection = (line: InbodyLayoutLine) => line.bbox.y0 >= start.bbox.y1 && line.bbox.y1 <= end.bbox.y0 && line.bbox.x0 >= leftEdge && line.bbox.x1 < rightEdge;
  if (leftLines.some(line => overlapsSection(line) && !inSection(line))) return [];
  const section = leftLines.filter(inSection);
  const abbreviations = section.filter(line => /\bPBF\b/i.test(line.text) || /\bPBF\b/i.test(line.words.map(word => word.text).join(' ')));
  const labels = section.filter(line => /\bPercent Body Fat\b/i.test(normalize(line.text))
    || /\bPercent Body Fat\b/i.test(normalize(line.words.map(word => word.text).join(' '))));
  if (abbreviations.length !== 1 || labels.length !== 1) return [];
  const row = abbreviations[0], label = labels[0];
  if (!exactLine(row) || !exactLine(label) || normalize(label.text) !== 'Percent Body Fat'
    || row.words.length !== 3 || !/^PBF \(%\) \d+\.\d+$/.test(normalize(row.text))) return [];
  const [abbreviation, unit, value] = row.words;
  if (abbreviation.text !== 'PBF' || unit.text !== '(%)' || !/^\d+\.\d+$/.test(value.text)) return [];
  const rowHeight = row.bbox.y1 - row.bbox.y0, labelHeight = label.bbox.y1 - label.bbox.y0;
  if (label.bbox.y0 < row.bbox.y1 || label.bbox.y0 - row.bbox.y1 > rowHeight * 1.5
    || Math.abs(label.bbox.x0 - abbreviation.bbox.x0) > Math.min(rowHeight, labelHeight) * .5
    || label.bbox.x1 >= unit.bbox.x0
    || Math.abs(abbreviation.bbox.x0 - start.bbox.x0) > start.bbox.y1 - start.bbox.y0) return [];
  const overlap = Math.min(...row.words.map(word => word.bbox.y1)) - Math.max(...row.words.map(word => word.bbox.y0));
  if (overlap < Math.min(...row.words.map(word => word.bbox.y1 - word.bbox.y0)) * .6) return [];
  // No intervening/overlapping text, number or separately recognized unit can
  // be borrowed or silently consumed between the paired rows.
  if (section.some(line => line !== row && line !== label
    && line.bbox.y1 > row.bbox.y0 && line.bbox.y0 < label.bbox.y1)) return [];
  // Unknown headings remain barriers. Only identifiable preceding BMI graph
  // annotations and right-hand numeric tick runs may occur in this narrow zone.
  const prior = section.filter(line => line.bbox.y1 <= row.bbox.y0);
  if (prior.some(line => {
    // Non-measurement ticks may have low confidence, but contradictory text
    // streams or detached word geometry cannot establish harmless context.
    if (!coherentLine(line)) return true;
    const text = normalize(line.text);
    if (text === 'Body Mass Index' || /^BMI(?:\s+[\d().?/%mkg²]+)+$/.test(text)) return false;
    return !(line.bbox.x0 >= unit.bbox.x0 && /^\d+(?:\.\d+)*(?:\s+\d+(?:\.\d+)*)+$/.test(text));
  })) return [];
  return [{ text: start.text, confidence: start.confidence }, {
    text: `PBF ${normalize(label.text)} ${unit.text} ${value.text}`,
    confidence: Math.min(row.confidence, label.confidence, ...row.words.map(word => word.confidence), ...label.words.map(word => word.confidence)),
  }];
}

/** Tesseract may split table columns into separate blocks. Rejoin only words
 * on the same visible row inside three independently identified headings.
 * Never concatenate the next text line or scrape the first available number. */
export function inbodyLayoutLines(lines: readonly InbodyLayoutLine[]): InbodyOcrLine[] {
  const findHeading = (text: string) => {
    const matches = lines.filter(line => line.confidence >= 60 && normalize(line.text) === text);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const start = findHeading('Body Composition Analysis');
  const end = findHeading('Muscle-Fat Analysis');
  const right = findHeading('Research Parameters');
  if (!start || !end || !right || end.bbox.y0 <= start.bbox.y1
    || Math.abs(start.bbox.x0 - end.bbox.x0) > (start.bbox.y1 - start.bbox.y0)
    || right.bbox.x0 <= Math.max(start.bbox.x1, end.bbox.x1)) return [];
  const leftEdge = start.bbox.x0 - (start.bbox.y1 - start.bbox.y0);
  // OCR glyph boxes for left-aligned headings and row text can differ by a
  // few pixels. Use a heading-height gutter, not exact x-coordinate equality.
  const rightEdge = right.bbox.x0 - (right.bbox.y1 - right.bbox.y0);
  const inTable = (box: Box) => box.y0 >= start.bbox.y1 && box.y1 <= end.bbox.y0
    && box.x0 >= leftEdge && box.x0 < rightEdge;
  const words = lines.flatMap(line => line.words).filter(word => inTable(word.bbox));
  const rows: { box: Box; words: typeof words }[] = [];
  for (const word of [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
    const box = word.bbox;
    const row = rows.find(row => Math.min(row.box.y1, box.y1) - Math.max(row.box.y0, box.y0)
      >= Math.min(row.box.y1 - row.box.y0, box.y1 - box.y0) * .6);
    if (row) { row.words.push(word); row.box.y0 = Math.min(row.box.y0, box.y0); row.box.y1 = Math.max(row.box.y1, box.y1); }
    else rows.push({ box: { ...box }, words: [word] });
  }
  const assembled = rows.map(row => ({ text: row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0).map(word => word.text).join(' '),
    confidence: Math.min(...row.words.map(word => word.confidence)) }));
  const ordered = [...lines].sort((a, b) => Number(a.bbox.x0 >= rightEdge) - Number(b.bbox.x0 >= rightEdge) || a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  return [...headerDateLine(lines, start.bbox.y0), ...ordered.filter(line => !DATE_LABEL.test(line.text)).flatMap(line => line === start ? [{ text: line.text, confidence: line.confidence }, ...assembled]
    : inTable(line.bbox) ? [] : [{ text: line.text, confidence: line.confidence }]),
    ...verifiedBodyFatPercentGraphRow(lines, leftEdge, rightEdge)];
}

function measurement(text: string, field: Field) {
  const label = text.match(field.label);
  if (!label) return undefined;
  const tail = text.slice(label[0].length).trim();
  // Explicit label + explicit unit + one current value. A parenthesized
  // reference interval is permitted but is never itself a candidate.
  const number = '(\\d+(?:\\.\\d+)?)';
  const range = '(?:\\s*\\(\\s*\\d+(?:\\.\\d+)?\\s*[~–-]\\s*\\d+(?:\\.\\d+)?\\s*\\))?';
  const before = tail.match(new RegExp(`^\\(([^()]+)\\)\\s*${number}${range}$`));
  const after = tail.match(new RegExp(`^${number}\\s*([^\\s()]+)${range}$`));
  const unit = before?.[1] ?? after?.[2];
  const token = before?.[2] ?? after?.[1];
  if (!unit || !token || !field.unit.test(unit) || (field.decimal && !token.includes('.'))) return undefined;
  const value = Number(token);
  return Number.isFinite(value) && value >= field.min && value <= field.max
    ? { value, originalText: text, originalLabel: label[0], originalUnit: unit } : undefined;
}

/** Fail closed on unrecognized model, headings, units, chart ticks and duplicates. */
export function readInbody270sLines(lines: readonly InbodyOcrLine[]) {
  const normalized = lines.map(line => ({ ...line, text: normalize(line.text) }));
  const confirmedModel = normalized.some(line => line.confidence >= 60 && /^\[?\s*InBody\s*270S\s*\]?$/i.test(line.text));
  const candidates: Partial<Record<MetricKey, NonNullable<ReturnType<typeof measurement>>>> = {};
  const rejected = new Set<MetricKey>();
  let section: Section | undefined;
  if (!confirmedModel) return { candidates, confirmedModel };
  for (const line of normalized) {
    const heading = SECTIONS.find(([pattern]) => pattern.test(line.text));
    if (heading) { section = line.confidence >= 60 ? heading[1] : undefined; continue; }
    if (EXCLUDED_SECTION.test(line.text)) { section = undefined; continue; }
    const matchedFields = FIELDS.filter(item => item.section === section && item.label.test(line.text));
    if (!matchedFields.length && line.text) {
      // An unfamiliar heading/text row must not lend its later values the last
      // known section's meaning. Only complete known non-stored table rows pass.
      if (!(section === 'composition' && line.confidence >= 60 && UNSTORED_COMPOSITION_ROW.test(line.text))) section = undefined;
      continue;
    }
    for (const field of matchedFields) {
      const parsed = line.confidence >= 60 ? measurement(line.text, field) : undefined;
      if (!parsed || candidates[field.key]) rejected.add(field.key);
      else candidates[field.key] = parsed;
    }
  }
  for (const key of rejected) delete candidates[key];
  return { candidates, confirmedModel };
}

/** Two independently scaled OCR observations must both identify the same row. */
export function agreedInbody270sReport(observations: readonly (readonly InbodyOcrLine[])[]): OaReportResult {
  const reads = observations.map(readInbody270sLines);
  const values: OaReportResult['values'] = {};
  const metricSources: BodyMetricSources = {};
  if (reads.length >= 2 && reads.every(read => read.confirmedModel)) {
    for (const [key, label] of INBODY_270S_INVENTORY) {
      const candidate: ReturnType<typeof measurement> = reads[0].candidates[key];
      if (!candidate || !reads.every(read => read.candidates[key]?.value === candidate.value)) continue;
      values[key] = candidate.value;
      metricSources[key] = { device: 'InBody 270S English report', originalLabel: label,
        originalUnit: candidate.originalUnit, originalText: candidate.originalText,
        method: 'ocr', mappingVersion: 'inbody-270s-en-v1' };
    }
  }
  const dateReads = observations.map(lines => measurementDate(lines.map(line => ({ ...line, text: normalize(line.text) }))));
  const known = reads.length >= 2 && reads.every(read => read.confirmedModel);
  const date = dateReads[0];
  const detectedDate = known && date && dateReads.every(read => read?.date === date.date && read?.token === date.token) ? date.date : undefined;
  return { values, metricSources, detectedDate, recognizedCount: Object.keys(values).length,
    reviewKeys: INBODY_270S_INVENTORY.filter(([key]) => values[key] === undefined).map(([key]) => key),
    warnings: [known
      ? 'InBody270S 영문 결과지의 명확한 라벨·단위가 있는 항목만 읽어요. 그래프 눈금·목표값·과거 기록은 제외합니다. 측정 날짜 후보가 있더라도 사진과 직접 비교해 확인해 주세요. 날짜가 비어 있으면 직접 입력해 주세요.'
      : 'InBody270S 영문 양식을 확인하지 못했어요. 자동 반영하지 않으며 사진의 항목명·단위를 직접 확인해야 합니다. 다른 양식은 자동 지원하지 않아요.'] };
}

/** Explicit same-origin static-asset hosting; ordinary callers keep Tesseract's defaults. */
export type InbodyOcrAssets = { basePath: string };
export function inbodyLocalAssetOptions(assets: InbodyOcrAssets) {
  const path = assets.basePath;
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9._/-]+$/.test(path) || path.startsWith('//')
    || path.endsWith('/') || path.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('OCR 정적 자산 경로를 확인해 주세요.');
  }
  return { workerPath: `${path}/worker.min.js`, corePath: path, langPath: path,
    workerBlobURL: false, cacheMethod: 'none' as const };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(), url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없습니다.')); };
    image.src = url;
  });
}

export async function parseInbody270sReport(file: File, onProgress?: (progress: number) => void, assets?: InbodyOcrAssets): Promise<OaReportResult> {
  const localAssets = assets ? inbodyLocalAssetOptions(assets) : undefined;
  const image = await loadImage(file);
  const ratio = image.naturalHeight / image.naturalWidth;
  if (!Number.isFinite(ratio) || ratio < 1 || ratio > 2) throw new Error('InBody270S 영문 전체 결과지 사진을 선택해 주세요. OA 긴 보고서는 다른 형식을 선택해야 합니다.');
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = localAssets ? await createWorker('eng', undefined, localAssets) : await createWorker('eng');
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, tessedit_char_whitelist: '' });
    const images: HTMLCanvasElement[] = [];
    for (const width of [1800, 2100]) {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = Math.round(width * ratio);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이미지 분석을 시작할 수 없습니다.');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      images.push(canvas);
    }
    return await recognizeInbody270sImages(images, worker, onProgress);
  } finally {
    await worker.terminate();
  }
}

/** Shared local OCR adapter; accepts browser canvases or isolated Node buffers. */
export async function recognizeInbody270sImages(images: readonly ImageLike[], worker: Pick<Worker, 'recognize'>, onProgress?: (progress: number) => void) {
  const observations: InbodyOcrLine[][] = [];
  for (const image of images) {
    const result = await worker.recognize(image, {}, { text: true, blocks: true });
    observations.push(inbodyLayoutLines((result.data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph =>
      paragraph.lines.map(line => ({ ...line, confidence: Math.min(line.confidence, ...line.words.map(word => word.confidence)) }))))));
    onProgress?.(Math.round(observations.length / images.length * 100));
  }
  return agreedInbody270sReport(observations);
}
