/** Local, deterministic guidance. Missing records never mean an activity was not done. */
export type RecordState = 'loading' | 'ready' | 'error';
export type Guidance = { title: string; detail: string; basis: string };
export const guidanceText = (g: Guidance) => `${g.title} ${g.detail} (${g.basis})`;
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function unavailable(scope: string, state: RecordState): Guidance | null {
  return state === 'ready' ? null : { title: state === 'loading' ? `${scope} 기록을 확인하고 있어요.` : `${scope} 기록을 확인하지 못했어요.`, detail: '확인된 기록이 준비되면 함께 살펴볼게요.', basis: '아직 기록을 판단하지 않아요' };
}
function dated(scope: string, state: RecordState, date: string, today: string): Guidance | null {
  return unavailable(scope, state) ?? (!validDate(date) || !validDate(today) ? unavailable(scope, 'error') : date > today ? { title: '앞으로의 날짜를 보고 있어요.', detail: '미래 날짜의 기록으로 완료 여부를 판단하지 않을게요.', basis: date } : null);
}
export function fitnessGuidance(state: RecordState, date: string, today: string, raw: unknown, condition: unknown, recovery: unknown): Guidance {
  const blocked = dated('운동', state, date, today); if (blocked) return blocked;
  const r = object(raw), c = object(condition), recoveryRow = object(recovery);
  const basis = `${date} · 이 기기에 저장된 운동·몸 상태 기록`;
  if (r.workoutPain === true || ['pain', 'worse'].includes(String(r.workoutBackStatus)) || array(r.workoutNeurologicalSymptoms).length || array(c.signals).length || recoveryRow.recoveryMode === true)
    return { title: '몸 상태를 남겨 주셨네요.', detail: '완료 수보다 지금의 편안함을 먼저 챙겨요. 불편함이 있다면 기존 중단 안내를 확인해 주세요.', basis };
  if (r.workoutStatus === 'partial' || r.workoutStatus === 'stopped') return { title: '운동을 일부 진행하거나 멈춘 기록이 있어요.', detail: '여기까지 남긴 기록도 의미 있어요. 오늘의 몸 상태를 먼저 챙겨요.', basis };
  if (raw === true || r.workoutDone === true || r.workoutStatus === 'completed') return { title: '선택한 날의 운동 완료 기록이 있어요.', detail: '수고했어요. 더 채우려고 서두르지 않아도 괜찮아요.', basis };
  const extra = ['cardioDone', 'pullupDone', 'foamRollerDone'].filter(k => r[k] === true).length;
  return { title: extra ? `별도 활동 ${extra}종류를 완료로 남겼어요.` : '이 날짜의 운동 완료 기록은 아직 없어요.', detail: extra ? '본운동 완료와는 구분해서 보고 있어요. 내 속도로 이어가요.' : '기록이 없다고 운동을 하지 않았다는 뜻은 아니에요. 몸 상태에 맞춰 천천히 가요.', basis };
}
export function dietGuidance(state: RecordState, date: string, today: string, raw: unknown, meal: unknown, water: unknown): Guidance {
  const blocked = dated('식단', state, date, today); if (blocked) return blocked;
  const r = object(raw), m = object(meal), checks = object(r.meals);
  const count = ['breakfast', 'lunch', 'afternoon', 'dinner'].filter(k => checks[k] === true).length;
  const waterMl = finite(water) ?? finite(r.waterMl);
  const basis = `${date} · 기기 저장 기록만 사용 · 입력 중인 값 제외`;
  if (!Object.keys(r).length && !Object.keys(m).length && waterMl === null) return { title: '오늘 저장된 식단 기록은 아직 없어요.', detail: '안 먹었다는 뜻은 아니에요. 기억하고 싶은 식사부터 편하게 남겨도 좋아요.', basis };
  return { title: `저장된 식사 체크 ${count}개${waterMl === null ? '' : `, 물 ${waterMl.toLocaleString('ko-KR')}mL`}를 확인했어요.`, detail: '남긴 기록을 차근차근 살펴봐요. 이 기록만으로 식사량이나 영양이 충분한지는 판단하지 않아요.', basis };
}
export function languageGuidance(state: RecordState, today: string, progress: unknown, reviews: unknown, now: number): Guidance {
  const blocked = dated('학습', state, today, today); if (blocked) return blocked;
  const p = object(progress);
  if (p.completedLessonIds !== undefined && !Array.isArray(p.completedLessonIds) || p.activityDates !== undefined && !Array.isArray(p.activityDates)) return unavailable('학습', 'error')!;
  if (typeof p.updatedAt === 'string' && Date.parse(p.updatedAt) > now) return { title: '학습 기록의 날짜를 확인해 주세요.', detail: '미래 시각으로 저장된 기록은 지금의 완료 수로 판단하지 않을게요.', basis: '순서 학습 저장 시각 확인 필요' };
  const completed = new Set(array(p.completedLessonIds).filter(x => typeof x === 'string')).size;
  const dates = array(p.activityDates).filter(validDate).filter(d => d <= today);
  const due = array(reviews).filter(v => {
    const r = object(v);
    const created = typeof r.createdAt === 'string' ? Date.parse(r.createdAt) : NaN;
    const next = typeof r.nextReviewAt === 'string' ? Date.parse(r.nextReviewAt) : null;
    return Number.isFinite(created) && created <= now && (next === null || Number.isFinite(next) && next <= now);
  }).length;
  const basis = `${today} · 이 계정의 순서 학습·복습 저장 기록`;
  if (due) return { title: `복습 시점이 된 항목이 ${due}개 있어요.`, detail: '편할 때 하나만 다시 만나봐도 좋아요. 한꺼번에 끝내지 않아도 괜찮아요.', basis };
  if (dates.includes(today)) return { title: '오늘 순서 학습 활동을 남겼네요.', detail: `저장된 완료 수업은 ${completed}개예요. 조금씩 이어가는 걸 응원해요.`, basis };
  return { title: completed ? `저장된 완료 수업은 ${completed}개예요.` : '순서 학습 완료 기록은 아직 없어요.', detail: '오늘 기록이 없다고 공부하지 않았다는 뜻은 아니에요. 익숙한 수업부터 편하게 골라봐요.', basis };
}
export function growthGuidance(state: RecordState, date: string, today: string, scheduled: number, completed: number): Guidance {
  const blocked = dated('활동', state, date, today); if (blocked) return blocked;
  if (finite(scheduled) === null || finite(completed) === null || completed > scheduled) return unavailable('활동', 'error')!;
  const basis = `${date} · 현재 활동 중 해당 요일에 예정된 활동만`;
  return { title: scheduled ? `예정된 활동 ${scheduled}개 중 ${completed}개를 완료로 남겼어요.` : '이 날짜에 예정된 활동은 없어요.', detail: scheduled && completed === scheduled ? '하나씩 마친 기록이 쌓였네요. 수고했어요.' : completed ? '이미 남긴 한 걸음도 소중해요. 나머지는 내 속도로 이어가요.' : '완료 기록이 없어도 하루의 노력을 단정하지 않아요. 여유에 맞춰 골라봐요.', basis };
}
export function collectionGuidance(scope: string, state: RecordState, count: number): Guidance {
  return unavailable(scope, state) ?? { title: `불러온 ${scope} 기록은 ${count}개예요.`, detail: count ? '마음에 남는 기록 하나부터 다시 살펴봐도 좋아요.' : '아직 확인된 기록이 없어요. 편할 때 하나씩 남겨도 괜찮아요.', basis: '현재 계정에서 확인한 목록 기준' };
}
export function assistantGuidance(state: RecordState, count: number): Guidance {
  return unavailable('비서 할 일', state) ?? { title: count ? `아직 마침 표시가 없는 할 일이 ${count}개 있어요.` : '현재 확인한 미완료 할 일은 없어요.', detail: count ? '지금 손댈 수 있는 작은 일 하나부터 골라볼까요?' : '필요한 일이 떠오르면 편하게 말씀해 주세요.', basis: '비서에 저장된 할 일만 · 다른 앱 기록은 섞지 않아요' };
}
export function budgetGuidance(state: RecordState, month: string, today: string, count: number, expense: number, income: number, budget: number | null): Guidance {
  const blocked = dated('가계부', state, `${month}-01`, today); if (blocked) return blocked;
  if (finite(expense) === null || finite(income) === null || finite(count) === null || budget !== null && finite(budget) === null) return unavailable('가계부', 'error')!;
  const basis = `${month} · 선택 월의 저장된 기록과 예산에 따른 규칙 요약`;
  if (!count) return { title: '선택한 월에 확인된 기록은 아직 없어요.', detail: '지출이 없었다는 뜻은 아니에요. 기록이 준비되면 함께 살펴볼게요.', basis };
  const title = `${month} 기록 ${count}건, 지출 ${expense.toLocaleString('ko-KR')}원을 확인했어요.`;
  if (budget === null || budget <= 0) return { title, detail: '예산이 설정되지 않아 예산 대비 여유는 판단하지 않아요. 큰 항목부터 편하게 확인해 봐요.', basis };
  if (expense > budget) return { title, detail: '기록된 지출이 설정 예산을 넘었어요. 필수 지출을 무리하게 줄이기보다 큰 항목과 누락 여부부터 살펴봐요.', basis };
  if (income <= 0) return { title, detail: '수입 기록이 없어 저축률이나 전체 여유는 판단하지 않아요. 현재 기록부터 차분히 확인해 봐요.', basis };
  return { title, detail: '기록된 지출은 설정 예산 안에 있어요. 아직 남기지 않은 지출도 있는지 가볍게 확인해 봐요.', basis };
}
