import type { Page } from '@playwright/test';
import { expect } from './fixture';
import { parseChunkReview, type ChunkAnswerInput } from '../../utils/japaneseChunkReview';
import { uuid } from './japanese-level-flow-state';

// Validate a single UI-produced event before adopting its bytes as expected DB state.
// Historical events and generation must be exact; timestamps use the browser clock.
export function assertChunkDelta(previous: unknown, current: unknown, input: Omit<ChunkAnswerInput, 'attemptId'>, startedAt: number, observedAt: number) {
  const before = parseChunkReview(previous), after = parseChunkReview(current);
  expect(after.generation, 'chunk-delta-generation').toBe(before.generation);
  expect(Object.keys(after.events).length, 'chunk-delta-event-count').toBe(Object.keys(before.events).length + 1);
  for (const [id, event] of Object.entries(before.events)) expect(after.events[id], `chunk-delta-history:${id}`).toEqual(event);
  const additions = Object.values(after.events).filter(event => !Object.hasOwn(before.events, event.attemptId));
  expect(additions, 'chunk-delta-addition-count').toHaveLength(1);
  const event = additions[0];
  expect(event.attemptId, 'chunk-delta-attempt-id').toMatch(uuid);
  expect(event, 'chunk-delta-new-event').toEqual({ ...input, attemptId: event.attemptId, answeredAt: event.answeredAt });
  expect(observedAt, 'chunk-delta-clock-order').toBeGreaterThanOrEqual(startedAt);
  expect(observedAt - startedAt, 'chunk-delta-observation-window').toBeLessThan(90_000);
  expect(Date.parse(event.answeredAt), 'chunk-delta-earliest-answer').toBeGreaterThanOrEqual(startedAt);
  expect(Date.parse(event.answeredAt), 'chunk-delta-latest-answer').toBeLessThanOrEqual(observedAt);
  return event;
}

// Failure-only capability injection, scoped to one real listening-button click.
// Never create voices/utterances, invoke native speech or issue success callbacks.
// This certifies the unavailable-audio UI, never audible playback or real hearing.
export async function unavailableSpeech(page: Page) {
  await page.evaluate(() => {
    const target = window as Window & { __qaUnavailableSpeech?: { reads: number; restore: () => void } };
    if (target.__qaUnavailableSpeech) throw new Error('Speech fault already installed');
    const descriptor = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
    const control = { reads: 0, restore: () => {
      if (descriptor) Object.defineProperty(window, 'speechSynthesis', descriptor);
      else Reflect.deleteProperty(window, 'speechSynthesis');
      delete target.__qaUnavailableSpeech;
    } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get() { control.reads++; return undefined; } });
    target.__qaUnavailableSpeech = control;
  });
  return async () => page.evaluate(() => {
    const target = window as Window & { __qaUnavailableSpeech?: { reads: number; restore: () => void } };
    if (!target.__qaUnavailableSpeech) throw new Error('Speech fault missing');
    const reads = target.__qaUnavailableSpeech.reads;
    target.__qaUnavailableSpeech.restore();
    return reads;
  });
}
