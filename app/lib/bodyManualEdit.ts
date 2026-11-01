import type { InbodyRecord, InbodyRecordStore, WeightRecord, WeightRecordStore } from '../data/recordStorage';
import { mergeBodyFields, validMeasurementDate } from './bodyImport.ts';

export type BodyManualBaseline = { weight?: WeightRecord; inbody?: InbodyRecord };
export type BodyManualDraft = { date: string; dirty: boolean; owner: string | null; baseline: BodyManualBaseline; dirtyFields: string[] };

export function bodyManualBaseline(weight?: WeightRecord, inbody?: InbodyRecord): BodyManualBaseline {
  return structuredClone({ weight, inbody });
}

/** Invalid storage must not be interpreted as an empty store and overwritten. */
export function readBodyManualStore<T>(raw: string | null): T {
  const value = raw === null ? {} : JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.values(value).some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('저장된 기록을 읽지 못했습니다. 입력 내용은 유지합니다.');
  }
  return value as T;
}

const textFields = new Set(['memo', 'reportedBodyAgeUnit', 'bodyShape', 'measurementTime']);
function valueOf(baseline: BodyManualBaseline, key: string) {
  return key === 'weight' ? baseline.weight?.weight ?? baseline.inbody?.weight : baseline.inbody?.[key as keyof InbodyRecord];
}
function desiredValue(key: string, raw: string) {
  const input = raw.trim();
  if (!input) return undefined;
  if (textFields.has(key)) return input;
  const value = Number(input);
  const normalized = key === 'weight' ? Math.round(value * 10) / 10 : value;
  if (!Number.isFinite(normalized) || normalized < 0 || (key === 'weight' && normalized === 0)) throw new Error('수치를 확인해 주세요. 체중은 0보다 커야 합니다.');
  return normalized;
}

/** A manual save owns only fields the user actually changed, never the whole stale form. */
export function mergeBodyManualEdit(weights: WeightRecordStore, inbody: InbodyRecordStore, date: string, baseline: BodyManualBaseline, form: Record<string, string>, dirtyFields: string[], today: string) {
  if (!validMeasurementDate(date, today)) throw new Error('실제 측정 날짜를 확인해 주세요. 미래 날짜는 저장할 수 없습니다.');
  const latest = { weight: weights[date], inbody: inbody[date] };
  if ((baseline.weight || baseline.inbody) && !latest.weight && !latest.inbody) throw new Error('다른 곳에서 이 날짜 기록이 삭제되었습니다. 입력 내용은 유지합니다. 날짜를 다시 열어 확인해 주세요.');
  const patch: Record<string, string> = {};
  for (const key of new Set(dirtyFields)) {
    const desired = desiredValue(key, form[key] ?? '');
    const before = valueOf(baseline, key);
    const current = valueOf(latest, key);
    if (desired === before) continue;
    const sourceChanged = JSON.stringify(baseline.inbody?.metricSources?.[key]) !== JSON.stringify(latest.inbody?.metricSources?.[key]);
    if ((current !== before || sourceChanged || (key === 'weight' && Boolean(baseline.weight) !== Boolean(latest.weight))) && desired !== current) {
      throw new Error('수정한 항목이 다른 곳에서도 변경되었습니다. 입력 내용은 유지합니다. 날짜를 다시 열어 최신 기록을 확인해 주세요.');
    }
    if (desired !== current) patch[key] = form[key] ?? '';
  }
  const { weight: weightPatch, ...bodyPatch } = patch;
  const record = mergeBodyFields(latest.inbody, bodyPatch);
  if (baseline.weight && !latest.weight && record.weight !== undefined) throw new Error('다른 곳에서 체중 기록이 삭제되었습니다. 입력 내용은 유지합니다. 날짜를 다시 열어 확인해 주세요.');
  const nextWeights = { ...weights };
  const weight = weightPatch === undefined ? valueOf(latest, 'weight') : desiredValue('weight', weightPatch);
  if (weightPatch !== undefined || record.weight !== undefined) {
    if (weight !== undefined) {
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) throw new Error('저장된 체중 값을 확인해 주세요. 입력 내용은 유지합니다.');
      if (!latest.weight || weight !== latest.weight.weight) nextWeights[date] = { ...latest.weight, weight, recordedAt: new Date().toISOString() };
    } else delete nextWeights[date];
    delete record.weight;
    if (weight === undefined && record.metricSources) delete record.metricSources.weight;
    else if (weight !== valueOf(latest, 'weight') && record.metricSources?.weight) record.metricSources.weight = { ...record.metricSources.weight, method: 'ocr-edited' };
  }
  if (record.metricSources && !Object.keys(record.metricSources).length) delete record.metricSources;
  const nextInbody = { ...inbody };
  if (Object.keys(record).length) nextInbody[date] = record;
  else delete nextInbody[date];
  return { weights: nextWeights, inbody: nextInbody };
}

/** Destruction is scoped to the exact date-row snapshot the user saw. */
export function deleteBodyManualRecord(weights: WeightRecordStore, inbody: InbodyRecordStore, date: string, baseline: BodyManualBaseline) {
  if (!weights[date] && !inbody[date]) return { weights, inbody, alreadyDeleted: true };
  const latest = { weight: weights[date], inbody: inbody[date] };
  if (JSON.stringify(latest) !== JSON.stringify(baseline)) throw new Error('이 날짜 기록이 다른 곳에서 변경되었습니다. 삭제하지 않았습니다. 날짜를 다시 열어 최신 기록을 확인해 주세요.');
  const nextWeights = { ...weights };
  const nextInbody = { ...inbody };
  delete nextWeights[date];
  delete nextInbody[date];
  return { weights: nextWeights, inbody: nextInbody, alreadyDeleted: false };
}
