// @ts-check
// Numeric identities correspond to the existing reporter's append-only maps.
export const inventory = Object.freeze([
  Object.freeze({ source: 19, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 38, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 33, line: 8, column: 5, project: 5 }),
  Object.freeze({ source: 32, line: 39, column: 5, project: 5 }),
  Object.freeze({ source: 46, line: 8, column: 5, project: 5 }),
  Object.freeze({ source: 47, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 48, line: 9, column: 5, project: 5 }),
  Object.freeze({ source: 49, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 50, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 51, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 52, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 53, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 54, line: 3, column: 5, project: 5 }),
]);
export const browserCommand = 'node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts:3 tests/e2e/sync.spec.ts:3 tests/e2e/language-sync.spec.ts:8 tests/e2e/language-reset.spec.ts:39 tests/e2e/japanese-answer-persistence.spec.ts:8 tests/e2e/daily-review-completion.spec.ts:3 tests/e2e/language-reset-receipts.spec.ts:9 tests/e2e/japanese-middle-reading.spec.ts:3 tests/e2e/japanese-upper-reading.spec.ts:3 tests/e2e/japanese-level-choice.spec.ts:3 tests/e2e/japanese-due-review.spec.ts:3 tests/e2e/curriculum-corruption.spec.ts:3 tests/e2e/curriculum-terminal.spec.ts:3 --config playwright.chromium-smoke.config.ts --project chromium-app-smoke';
export const stages = Object.freeze([
  Object.freeze({ id: 'stage-01', command: 'node --test scripts/isolated-chromium-smoke/safety.test.mjs', timeoutMs: 60_000 }),
  Object.freeze({ id: 'stage-02', command: 'pinned-bundled-chromium-readiness', timeoutMs: 240_000, lifecycleDiagnostics: true }),
  Object.freeze({ id: 'stage-03', command: browserCommand, timeoutMs: 465_000, diagnosticInventory: inventory }),
]);
// Leave five seconds for process-group termination before the 13-minute ceiling.
export const totalTimeoutMs = 775_000;
