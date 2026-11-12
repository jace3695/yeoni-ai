import type { Page, Locator, BrowserContext, Route } from '@playwright/test';
import { expect, canonical, type State } from './fixture';
import { LANGUAGE_DATA_KEYS } from '../../app/data/languageStorageLock';
import { WORDS } from '../../data/words';
import { settingsState, hasSettingsAcknowledgement } from './japanese-settings-state';
import { synced, type Qa } from './japanese-level-flow-state';

export { settingsState, synced };
export const dailyKeys = ['dailyRoutineProgress', 'dailyLearningHistory'] as const;
export type ReferenceId = 'kana' | 'words';
export const journalKey = 'language-storage-transaction-v1';
export const saveFailure = 'CI synthetic daily journal pre-write failure';
export const scopeFailure = '저장 공간이나 계정 상태를 확인하지 못해 이번 답안 처리를 멈췄어요. 상태를 확인한 뒤 다시 눌러 주세요. 계정이나 기록을 바꿨다면 학습 화면을 다시 열어 주세요.';
export const localSuccess = '일일 학습 기록이 이 기기에 저장됐어요. 서버 동기화 완료를 뜻하지는 않아요.';
export const retryButton = (page: Page) => page.getByRole('button', { name: '일일 학습 기록 다시 저장', exact: true });
export const nextButton = (page: Page, id: ReferenceId) => page.getByRole('button', { name: id === 'kana' ? '다음 문제 →' : '다음 문제', exact: true });
const ownerKeys = ['language-cloud-sync-user', 'language-cloud-sync-epoch', 'fitness-cloud-sync-user', 'fitness-cloud-sync-epoch', 'languageRecordResetV1'];
const ownExtension = JSON.parse('{"__proto__":{"keep":["synthetic",7]},"constructor":{"keep":true},"future":{"nested":[false,null,3]}}') as State;

export async function seedReferenceState(qa: Qa): Promise<State> {
  const before = await qa.readLanguage();
  const state = { ...before,
    dailyRoutineProgress: JSON.stringify({ date: '2001-01-02', completedIds: ['review'], ...ownExtension }),
    dailyLearningHistory: JSON.stringify({ '2001-01-02': { completedIds: ['review'], completedCount: 1, totalCount: 5,
      updatedAt: '2001-01-02T00:00:00.000Z', ...ownExtension }, ...ownExtension }),
    savedWords: JSON.stringify([{ word: 'CI preserved word', meaning: 'synthetic meaning', example: 'CI preserved example', category: '일상', ...ownExtension }]),
    grammarProgress: JSON.stringify({ ...ownExtension, 'ci-preserved-grammar': { score: 2, total: 3 } }),
  };
  const result = await qa.account.client.from('language_user_state').update({ state }).eq('user_id', qa.account.id).select('state').single();
  expect(result.error, 'reference-seed-error').toBeNull();
  expect(canonical(result.data?.state), 'reference-seed-readback').toBe(canonical(state));
  return state;
}

// Compare every own key and raw relevant record, including absence. Auth-token
// refresh and cloud base bookkeeping are not learning records and are excluded.
export async function referenceSnapshot(page: Page) {
  return page.evaluate(({ language, owners, journal }) => Object.fromEntries(
    [...new Set([...language, ...owners, journal, 'yeoni-storage-transaction-v1',
      ...Object.keys(localStorage).filter(key => key.startsWith('ai-fitness-'))])].sort()
      .map(key => [key, localStorage.getItem(key)])), { language: [...LANGUAGE_DATA_KEYS], owners: ownerKeys, journal: journalKey });
}
export const equalRecords = (actual: unknown, expected: unknown, stage: string) => expect(canonical(actual), stage).toBe(canonical(expected));
export const languageWrites = (qa: Qa) => qa.traffic.entries.filter(entry => entry.table === 'language_user_state' && entry.method !== 'GET').length;
export async function unchanged(page: Page, qa: Qa, state: State, fitness: State, snapshot: State, writes: number) {
  equalRecords(await referenceSnapshot(page), snapshot, 'reference-local-records-unchanged');
  equalRecords(await qa.readLanguage(), state, 'reference-database-records-unchanged');
  equalRecords(await qa.read(), fitness, 'reference-fitness-unchanged');
  expect(languageWrites(qa), 'reference-no-new-language-write').toBe(writes);
}
export async function confirmed(page: Page, qa: Qa, state: State, fitness: State, since: number) {
  equalRecords(await settingsState(page), state, 'reference-exact-local-state');
  await expect.poll(async () => canonical(await qa.readLanguage()), { message: 'reference-authenticated-readback' }).toBe(canonical(state));
  await expect.poll(() => hasSettingsAcknowledgement(qa.traffic.entries.slice(since), state), { message: 'reference-genuine-conditional-patch-later-get' }).toBe(true);
  await synced(page); qa.traffic.assertLanguageConfirmed(state);
  equalRecords(await qa.read(), fitness, 'reference-fitness-unchanged');
}

// Only updatedAt may be observed, after its timestamp bounds and exact new IDs
// are checked. The expected state is independently built from the previous one.
export function assertDailyDelta(previous: State, current: State, id: ReferenceId, day: string, started: number, observed: number) {
  const oldProgress = JSON.parse(previous.dailyRoutineProgress as string) as Record<string, unknown>;
  const oldHistory = JSON.parse(previous.dailyLearningHistory as string) as Record<string, unknown>;
  const history = JSON.parse(current.dailyLearningHistory as string) as Record<string, Record<string, unknown>>;
  const item = history[day];
  expect(Object.hasOwn(history, day), 'reference-today-own-history').toBe(true);
  expect(item !== null && typeof item === 'object', 'reference-today-history-record').toBe(true);
  const prior = Object.hasOwn(oldHistory, day) ? oldHistory[day] as Record<string, unknown> : {};
  const ids = [...new Set([...(oldProgress.date === day ? oldProgress.completedIds as string[] : []), ...(prior.completedIds as string[] ?? []), id])];
  expect(observed >= started && observed - started < 90_000, 'reference-clock-window').toBe(true);
  const at = Date.parse(String(item.updatedAt));
  expect(Number.isFinite(at) && at >= started && at <= observed, 'reference-completion-timestamp').toBe(true);
  const expected = { ...previous,
    dailyRoutineProgress: JSON.stringify({ ...oldProgress, date: day, completedIds: ids }),
    dailyLearningHistory: JSON.stringify({ ...oldHistory, [day]: { ...prior, completedIds: ids,
      completedCount: Math.max(Number(prior.completedCount ?? 0), ids.length), totalCount: prior.totalCount ?? 5, updatedAt: item.updatedAt } }),
  };
  equalRecords(current, expected, 'reference-exact-daily-delta');
  return expected;
}

// This is serialized directly into the disposable page, and exercised with a
// private synthetic Storage control. No application/global security setting changes.
export function installJournalHarness(input: { expected: Record<string, string | null>; fail: boolean }) {
  const target = window as Window & { __qaReferenceJournal?: { restore: () => boolean; stats: { hits: number; dailyWrites: number; otherJournals: number } } };
  if (target.__qaReferenceJournal) throw new Error('Reference journal harness already installed');
  const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
  if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.configurable) throw new Error('Reference native setItem descriptor unavailable');
  const original = descriptor.value as Storage['setItem'];
  const stats = { hits: 0, dailyWrites: 0, otherJournals: 0 };
  const keys = ['dailyLearningHistory', 'dailyRoutineProgress'];
  const control = { stats, restore: () => {
    Object.defineProperty(Storage.prototype, 'setItem', descriptor);
    const after = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    delete target.__qaReferenceJournal;
    return after?.value === descriptor.value && after?.writable === descriptor.writable
      && after?.enumerable === descriptor.enumerable && after?.configurable === descriptor.configurable;
  } };
  Object.defineProperty(Storage.prototype, 'setItem', { ...descriptor, value: function (this: Storage, key: string, value: string) {
    if (this === localStorage) {
      if (keys.includes(key)) stats.dailyWrites++;
      if (key === 'language-storage-transaction-v1') {
        let journal: unknown;
        try { journal = JSON.parse(value); } catch { journal = null; }
        const exact = journal !== null && typeof journal === 'object' && !Array.isArray(journal)
          && JSON.stringify(Object.keys(journal).sort()) === JSON.stringify(keys)
          && keys.every(k => Object.hasOwn(journal!, k) && (journal as Record<string, unknown>)[k] === input.expected[k]);
        if (exact && input.fail && stats.hits === 0) { stats.hits++; throw new Error('CI synthetic daily journal pre-write failure'); }
        if (!exact) stats.otherJournals++;
      }
    }
    return original.call(this, key, value);
  } });
  target.__qaReferenceJournal = control;
}
export async function journalStats(page: Page) {
  return page.evaluate(() => {
    const control = (window as Window & { __qaReferenceJournal?: { stats: { hits: number; dailyWrites: number; otherJournals: number } } }).__qaReferenceJournal;
    if (!control) throw new Error('Reference journal harness missing');
    return control.stats;
  });
}
export async function restoreJournal(page: Page) {
  const restored = await page.evaluate(() => (window as Window & { __qaReferenceJournal?: { restore: () => boolean } }).__qaReferenceJournal?.restore());
  expect(restored, 'reference-native-descriptor-restored').toBe(true);
}

export async function kanaAnswers(page: Page) {
  const entries = await page.locator('[role="button"][aria-label$=" 발음 듣기"]').evaluateAll(cards => cards.map(card => {
    const labels = card.querySelectorAll(':scope > span');
    return [labels[0]?.textContent?.trim() ?? '', labels[1]?.textContent?.trim() ?? ''];
  }));
  expect(entries.length, 'reference-kana-source-visible').toBeGreaterThan(4);
  expect(entries.every(([char, roman]) => char.length > 0 && roman.length > 0), 'reference-kana-source-labels').toBe(true);
  return Object.fromEntries(entries);
}
export async function correctChoice(page: Page, id: ReferenceId, kana: Record<string, string>): Promise<Locator> {
  if (id === 'kana') {
    const quiz = page.getByText('점수', { exact: true }).locator('../..');
    const char = (await quiz.locator(':scope > div').nth(1).locator('span').innerText()).trim();
    expect(Object.hasOwn(kana, char), 'reference-kana-visible-question-source').toBe(true);
    const choice = quiz.getByRole('button', { name: kana[char], exact: true });
    await expect(choice).toHaveCount(1); return choice;
  }
  const jp = '일본어에 맞는 뜻을 고르세요', kr = '뜻에 맞는 일본어를 고르세요';
  const instruction = page.getByText(/^(일본어에 맞는 뜻을 고르세요|뜻에 맞는 일본어를 고르세요)$/);
  const mode = await instruction.innerText(); expect([jp, kr], 'reference-word-quiz-kind').toContain(mode);
  const card = instruction.locator('..');
  const prompt = (await card.locator(':scope > div').nth(1).innerText()).trim();
  // Match the unchanged default UI filters, rather than borrowing alternate
  // meanings from a different level/scope that is not in this quiz's pool.
  await expect(page.getByRole('combobox', { name: '연습 자료', exact: true })).toHaveValue('core');
  const pool = WORDS.filter(word => (word.level ?? 'beginner') === 'beginner' && (word.practiceGroup ?? 'core') === 'core');
  const normalize = (value: string) => value.normalize('NFKC').trim();
  const correct = new Set(pool.filter(word => normalize(mode === jp ? word.word : word.meaning) === normalize(prompt)).map(word => normalize(mode === jp ? word.meaning : word.word)));
  expect(correct.size, 'reference-word-source-match').toBeGreaterThan(0);
  const choices = card.locator('button').filter({ hasNotText: /^다음 문제$/ });
  const labels = await choices.evaluateAll(buttons => buttons.map(button => (button.firstElementChild?.textContent ?? button.textContent ?? '').trim()));
  const indexes = labels.flatMap((label, index) => correct.has(normalize(label)) ? [index] : []);
  expect(indexes, 'reference-word-single-valid-choice').toHaveLength(1);
  return choices.nth(indexes[0]);
}
export async function score(page: Page, id: ReferenceId, count: number) {
  const target = id === 'kana' ? page.getByText('점수', { exact: true }).locator('..') : page.getByText(/^점수:/).filter({ has: page.locator('strong') });
  await expect(target, 'reference-score-once').toHaveText(new RegExp(`^점수:?\\s*${count}\\s*/\\s*${count}${id === 'kana' && count > 0 ? '\\s*\\(100%\\)' : ''}$`));
}
export async function noApplicationAlerts(page: Page) {
  // Exclude only the framework route-announcer element, not real app alerts.
  const announcer = page.locator('next-route-announcer > div#__next-route-announcer__[role="alert"][aria-live="assertive"]');
  const alerts = page.getByRole('alert');
  await expect(announcer).toHaveCount(1); await expect(alerts.and(announcer)).toHaveCount(1); await expect(alerts).toHaveCount(1);
}

export async function silentGuard(page: Page, context: BrowserContext) {
  let apiRequests = 0, pageErrors = 0;
  const deny = async (route: Route) => { apiRequests++; await route.abort('blockedbyclient'); };
  const onError = () => { pageErrors++; };
  await context.route('http://127.0.0.1:3000/api/**', deny);
  page.on('pageerror', onError);
  await context.addInitScript(() => {
    const target = window as Window & { __qaReferenceSpeech?: { attempts: number; restore: () => boolean } };
    const speech = window.speechSynthesis;
    const descriptor = speech && Object.getOwnPropertyDescriptor(speech, 'speak');
    const control = { attempts: 0, restore: () => {
      if (speech) {
        if (descriptor) Object.defineProperty(speech, 'speak', descriptor);
        else Reflect.deleteProperty(speech, 'speak');
      }
      delete target.__qaReferenceSpeech;
      const after = speech && Object.getOwnPropertyDescriptor(speech, 'speak');
      return descriptor ? after?.value === descriptor.value && after?.get === descriptor.get && after?.set === descriptor.set
        && after?.configurable === descriptor.configurable && after?.enumerable === descriptor.enumerable && after?.writable === descriptor.writable : after === undefined;
    } };
    if (speech) Object.defineProperty(speech, 'speak', { configurable: true, value() { control.attempts++; throw new Error('Reference case forbids native speech'); } });
    target.__qaReferenceSpeech = control;
  });
  return {
    check: async () => {
      expect(apiRequests, 'reference-no-app-api-or-paid-call').toBe(0);
      expect(pageErrors, 'reference-no-application-errors').toBe(0);
      expect(await page.evaluate(() => (window as Window & { __qaReferenceSpeech?: { attempts: number } }).__qaReferenceSpeech?.attempts), 'reference-no-native-speech-attempts').toBe(0);
    },
    restore: async () => {
      try { if (!page.isClosed()) expect(await page.evaluate(() => (window as Window & { __qaReferenceSpeech?: { restore: () => boolean } }).__qaReferenceSpeech?.restore()), 'reference-speech-descriptor-restored').toBe(true); }
      finally { page.off('pageerror', onError); await context.unroute('http://127.0.0.1:3000/api/**', deny); }
    },
  };
}

export async function boardCheck(page: Page) {
  await page.getByRole('button', { name: '쓰기 연습', exact: true }).click();
  // First is the trace submode, second is its selected view guide. Both real UI.
  await page.getByRole('button', { name: '쓰기 보기', exact: true }).first().click();
  await page.getByRole('button', { name: '쓰기 보기', exact: true }).last().click();
  const selection = page.getByText(/^\d+\s*\/\s*\d+\s*·\s*\S+$/);
  await expect(selection, 'reference-one-visible-writing-selection').toHaveCount(1);
  await expect(selection).toBeVisible();
  const selectedGlyph = (await selection.innerText()).match(/·\s*(\S+)$/)?.[1] ?? '';
  const grid = page.locator('.kana-writing-grid');
  await expect(grid.getByRole('heading', { name: '쓰기 순서 보기', exact: true })).toBeVisible();
  await expect(grid.getByRole('heading', { name: '따라 써보기', exact: true })).toBeVisible();
  const boards = grid.locator(':scope > section > div:last-child');
  await expect(boards).toHaveCount(2);
  await expect.poll(() => grid.locator('svg').evaluateAll(items => items.length === 2 && items.every(svg => svg.querySelectorAll('path').length > 0))).toBe(true);
  const geometry = await boards.evaluateAll(elements => elements.map(board => {
    const style = getComputedStyle(board), rect = board.getBoundingClientRect();
    const svg = board.querySelector('svg'), guide = svg?.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, background: style.backgroundColor,
      image: style.backgroundImage, guide: guide && { x: guide.x - rect.x, y: guide.y - rect.y, width: guide.width, height: guide.height },
      glyph: svg?.getAttribute('aria-label')?.split(' ')[0], paths: svg?.querySelectorAll('path').length ?? 0 };
  }));
  assertBoards(geometry, selectedGlyph);
  const canvas = page.getByLabel('가나 쓰기 연습장', { exact: true });
  await expect(canvas).toHaveCount(1); await expect(canvas).toHaveCSS('touch-action', 'none');
  const alpha = () => canvas.evaluate(node => {
    const target = node as HTMLCanvasElement, context = target.getContext('2d');
    if (!context) throw new Error('Reference canvas context unavailable');
    const data = context.getImageData(0, 0, target.width, target.height).data;
    let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
    return count;
  });
  expect(await alpha(), 'reference-initial-blank-canvas').toBe(0);
  await canvas.scrollIntoViewIfNeeded(); const rect = await canvas.boundingBox();
  expect(rect, 'reference-usable-canvas-bounds').not.toBeNull();
  await page.mouse.move(rect!.x + rect!.width * .25, rect!.y + rect!.height * .3);
  await page.mouse.down();
  try { await page.mouse.move(rect!.x + rect!.width * .7, rect!.y + rect!.height * .65, { steps: 5 }); }
  finally { await page.mouse.up(); }
  expect(await alpha(), 'reference-real-pointer-ink').toBeGreaterThan(0);
  await page.getByRole('button', { name: '지우기', exact: true }).click();
  expect(await alpha(), 'reference-real-clear-ink').toBe(0);
  await page.getByRole('button', { name: '흐린 글자', exact: true }).click();
  await expect(canvas).toHaveCount(1); await expect(canvas).toBeVisible();
  const faint = await canvas.locator('..').evaluate(board => ({ background: getComputedStyle(board).backgroundColor,
    image: getComputedStyle(board).backgroundImage, glyph: board.querySelector('svg')?.getAttribute('aria-label')?.split(' ')[0] }));
  expect(faint, 'reference-faint-shared-background-guide').toEqual({ background: geometry[1].background, image: geometry[1].image, glyph: geometry[1].glyph });
  await noOverflow(page);
}
type Board = { x: number; y: number; width: number; height: number; background: string; image: string; guide?: { x: number; y: number; width: number; height: number }; glyph?: string; paths: number };
export function assertBoards(boards: Board[], selectedGlyph: string) {
  expect(selectedGlyph.trim().length > 0, 'reference-selected-writing-glyph').toBe(true);
  expect(boards, 'reference-two-boards').toHaveLength(2);
  expect(boards[0].background, 'reference-white-board').toBe('rgb(255, 255, 255)');
  expect(boards[0].image, 'reference-cross-guides').toContain('linear-gradient');
  for (const board of boards) {
    expect(board.width >= 100 && Math.abs(board.width - board.height) <= 1, 'reference-square-usable-board').toBe(true);
    expect(board.guide && Math.abs(board.guide.x - 1) <= 1 && Math.abs(board.guide.y - 1) <= 1
      && Math.abs(board.guide.width - (board.width - 2)) <= 1 && Math.abs(board.guide.height - (board.height - 2)) <= 1, 'reference-guide-alignment').toBe(true);
    expect(board.paths > 0, 'reference-loaded-glyph').toBe(true);
    expect(typeof board.glyph === 'string' && board.glyph.trim().length > 0, 'reference-nonempty-board-glyph').toBe(true);
    expect(board.glyph, 'reference-board-matches-selected-glyph').toBe(selectedGlyph);
  }
  expect([boards[1].background, boards[1].image, boards[1].glyph], 'reference-identical-board-background-glyph').toEqual([boards[0].background, boards[0].image, boards[0].glyph]);
  expect(Math.abs(boards[0].width - boards[1].width) <= 1 && Math.abs(boards[0].x - boards[1].x) <= 1, 'reference-stacked-board-alignment').toBe(true);
}
export async function noOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.viewport, 'reference-320-css-pixels').toBe(320);
  expect(geometry.scroll, 'reference-no-horizontal-overflow').toBeLessThanOrEqual(geometry.viewport);
}
