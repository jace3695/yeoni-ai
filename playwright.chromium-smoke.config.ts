import { defineConfig } from '@playwright/test';

// This lane is independent of the full browser configuration and its WebKit guards.
const env = process.env;
const anonymousKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
function validAnonymousKey(key: string | undefined): boolean {
  if (!key || key.length >= 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; }
  catch { return false; }
}
if (env.CI !== 'true' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_TEMP !== '/home/runner/work/_temp'
  || env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/agent/yeoni-japanese-ci-20261110'
  || env.YEONI_E2E !== '1' || env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321'
  || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !validAnonymousKey(anonymousKey)
  || Object.keys(env).some(key => key.startsWith('VERCEL') && env[key])) {
  throw new Error('Disposable Chromium context required');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['auth.spec.ts', 'sync.spec.ts', 'language-sync.spec.ts', 'language-reset.spec.ts', 'japanese-answer-persistence.spec.ts', 'daily-review-completion.spec.ts', 'language-reset-receipts.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['./tests/e2e/reporter.ts']],
  outputDir: '.e2e/chromium-smoke-output',
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    baseURL: 'http://127.0.0.1:3000',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    timezoneId: 'Asia/Seoul',
    locale: 'ko-KR',
    serviceWorkers: 'block',
    trace: 'off', screenshot: 'off', video: 'off',
  },
  projects: [{ name: 'chromium-app-smoke' }],
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000/diet/settings',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
