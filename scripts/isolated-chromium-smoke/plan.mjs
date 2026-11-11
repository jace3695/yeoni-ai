// @ts-check
// Numeric identities correspond to the existing reporter's append-only maps.
export const inventory = Object.freeze([
  Object.freeze({ source: 19, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 38, line: 3, column: 5, project: 5 }),
  Object.freeze({ source: 33, line: 8, column: 5, project: 5 }),
  Object.freeze({ source: 32, line: 39, column: 5, project: 5 }),
  Object.freeze({ source: 46, line: 8, column: 5, project: 5 }),
  Object.freeze({ source: 47, line: 3, column: 5, project: 5 }),
]);
export const browserCommand = 'node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts:3 tests/e2e/sync.spec.ts:3 tests/e2e/language-sync.spec.ts:8 tests/e2e/language-reset.spec.ts:39 tests/e2e/japanese-answer-persistence.spec.ts:8 tests/e2e/daily-review-completion.spec.ts:3 --config playwright.chromium-smoke.config.ts --project chromium-app-smoke';
export const stages = Object.freeze([
  Object.freeze({ id: 'stage-01', command: 'node --test scripts/isolated-chromium-smoke/safety.test.mjs', timeoutMs: 60_000 }),
  Object.freeze({ id: 'stage-02', command: 'node node_modules/@playwright/test/cli.js install --with-deps --only-shell chromium', timeoutMs: 240_000 }),
  Object.freeze({ id: 'stage-03', command: browserCommand, timeoutMs: 465_000, diagnosticInventory: inventory }),
]);
// Leave five seconds for process-group termination before the 13-minute ceiling.
export const totalTimeoutMs = 775_000;
