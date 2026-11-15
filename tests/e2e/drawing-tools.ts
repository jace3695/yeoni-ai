import type { Page, Request } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { expect } from './fixture';
import packData from '../../content/drawing/foundations-v1.json';
import { newDocument, parseAttempt, parsePack, type Attempt, type DrawingDocument } from '../../lib/drawing/model';
import { projectLesson, projectState, projectSource } from '../../lib/drawing/projects';
import { correctionCopy } from '../../lib/drawing/copy';
import { memorySource } from '../../lib/drawing/memory';
import { copyAnalysis } from '../../lib/drawing/structure';
import { identityState, identitySnapshot } from '../../lib/drawing/identity';
import { originalState, originalSnapshot, originalFrames } from '../../lib/drawing/original';

// Retirement is not a successful exercise. Only the actual retired section is
// control-free; ordinary app navigation, login and unrelated sync remain allowed.
export async function assertRetiredPractice(page: Page) {
  const heading = page.getByRole('heading', { name: '이 연습은 종료했어요', exact: true });
  await expect(heading).toHaveCount(1); await expect(heading).toBeVisible();
  const section = heading.locator('..');
  await expect(section.getByText('기존 기록은 삭제하지 않고 보관합니다.', { exact: true })).toBeVisible();
  await expect(section.locator('input, textarea, select, canvas, button')).toHaveCount(0);
  await expect(section.getByRole('link', { name: '내 자기계발로', exact: true })).toHaveAttribute('href', '/growth');
  await expect(page.getByLabel('내 그림 연습장', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '키보드 자리 연습 입력', exact: true })).toHaveCount(0);
  await expect(page.locator('#drawing-map')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

export function observeRetiredRequests(page: Page) {
  const forbidden: string[] = [];
  const observe = (request: Request) => {
    const url = new URL(request.url()), write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
    const legacyTable = /^\/rest\/v1\/(growth_drawing_attempts|growth_sessions|growth_routines)(?:\/|$)/.test(url.pathname);
    const objectMoveOrCopy = /^\/storage\/v1\/object\/(?:move|copy)(?:\/|$)/.test(url.pathname);
    const legacyAsset = url.pathname.includes('/storage/v1/object/') && /\/growth-resources(?:\/|$)/.test(url.pathname) && !/^\/storage\/v1\/object\/(?:sign|list|info|public|authenticated)(?:\/|$)/.test(url.pathname);
    const execution = /^\/api\/(?:claude(?:\/|$)|yeoni\/record-reply(?:\/|$)|ai\/|assistant\/(?:chat|[a-z-]+-commands)(?:\/|$)|growth\/coach(?:\/|$)|chatgpt\/advice(?:\/|$)|language\/tts(?:\/|$)|.*(?:drawing|typing|tts))/.test(url.pathname);
    if ((write && (legacyTable || legacyAsset || objectMoveOrCopy)) || execution) forbidden.push(`${request.method()} ${url.pathname}`);
  };
  page.on('request', observe);
  return { assertQuiet: () => expect(forbidden, 'retired browser features issue no mutations or AI execution requests').toEqual([]), dispose: () => page.off('request', observe) };
}

export async function visitRetiredPractice(page: Page, path: string) {
  if (!['/growth/drawing', '/growth/typing', '/growth/typing/basics'].includes(path)) throw Error('Unexpected retired route');
  await page.goto(path, { waitUntil: 'domcontentloaded' }); await assertRetiredPractice(page);
  await page.reload({ waitUntil: 'domcontentloaded' }); await assertRetiredPractice(page);
  await page.getByRole('link', { name: '내 자기계발로', exact: true }).click();
  await expect(page).toHaveURL(/\/growth$/);
  await page.goBack({ waitUntil: 'domcontentloaded' }); await assertRetiredPractice(page);
}

// Fixture-only historical input, not UI-created progress or imported user data.
export async function seedLegacyDrawing(client: SupabaseClient, owner: string, lessonId: string, references: string[] = []) {
  const pack = parsePack(packData);
  const lesson = lessonId.startsWith('C') ? projectLesson(pack, lessonId) : pack.lessons.find(item => item.id === lessonId)!;
  if (!lesson) throw Error('Unknown fixture lesson');
  const document = newDocument(lesson, lesson.examples[0], pack.version);
  document.memo = `Synthetic retained ${lessonId}`; document.references = references;
  document.strokes = [{ points: [[100, 100, 0.5], [200, 200, 0.5]], color: '#34314b', width: 2, erase: false }];
  const id = randomUUID();
  if (lesson.originalPractice) document.original = originalState({ id, document } as Attempt);
  const result = await client.from('growth_drawing_attempts').insert({ id, user_id: owner, status: 'draft', document }).select('*').single();
  expect(result.error).toBeNull(); expect(result.data).toBeTruthy();
  return parseAttempt(result.data);
}

// Model-authentic historical relationships, not a new arbitrary backup field.
// These pure builders prepare synthetic OLD documents, never mount retired UI.
export function legacyRelationDocument(target: Attempt, source: Attempt, additional: Attempt[] = []): DrawingDocument {
  let document = structuredClone(target.document);
  const id = document.lesson.id;
  if (id === 'D27') document = correctionCopy(target, source);
  else if (id === 'D33') document = { ...document, ...memorySource(target, source) };
  else if (id === 'D46') document = { ...document, ...copyAnalysis(document, source) };
  else if (id.startsWith('C')) document.project = { ...projectState(document), source: projectSource(source) };
  else if (id === 'D61' || id === 'D70') {
    if (id === 'D70' && additional.length !== 2) throw Error('Historical collection fixture is required');
    document.identity = { ...identityState(document), baseline: identitySnapshot(source), collection: additional.map(identitySnapshot), ...(additional.length ? { editing: additional[0].id } : {}) };
    document.references = [...new Set([...document.references, ...additional.map(item => item.id)])];
  }
  else if (['D77', 'D78', 'D79', 'D80'].includes(id)) {
    const snapshot = originalSnapshot(source), snapshots = [snapshot, ...additional.map(originalSnapshot)];
    if (id === 'D80') {
      expect(snapshots.map(item => item.lessonId)).toEqual(['D74', 'D78', 'D79']);
      const expressions = originalFrames(additional[0].document), poses = originalFrames(additional[1].document);
      expect(new Set(expressions.map(frame => frame.expression)).size).toBe(3);
      expect(new Set(poses.map(frame => frame.pose)).size).toBe(3);
      expect([...expressions, ...poses].every(frame => frame.strokes.length > 0)).toBe(true);
    }
    const state = originalState(target);
    document.original = { ...state, projectId: snapshot.projectId, design: structuredClone(snapshot.design), sources: snapshots,
      expression: id === 'D78' ? 'surprised' : 'happy',
      panels: id === 'D79' ? { ...state.panels, wave: structuredClone(document.strokes), second: structuredClone(document.strokes) } : state.panels };
    document.references = snapshots.map(item => item.attemptId);
  }
  const parsed = parseAttempt({ ...target, document });
  expect(parsed.document, 'synthetic historical relation survives actual model parsing without field loss').toEqual(document);
  return document;
}

export async function saveLegacyRelation(client: SupabaseClient, target: Attempt, source: Attempt, additional: Attempt[] = []) {
  const document = legacyRelationDocument(target, source, additional);
  const saved = await client.from('growth_drawing_attempts').update({ revision: target.revision + 1, document }).eq('id', target.id).eq('revision', target.revision).select('*').single();
  expect(saved.error).toBeNull();
  const parsed = parseAttempt(saved.data); expect(parsed).toEqual(saved.data);
  return parsed;
}
