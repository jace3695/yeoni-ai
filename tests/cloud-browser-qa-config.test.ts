import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('automatic Vercel deployment suppression is limited to the two exact unpublished QA branches', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(config, {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    git: { deploymentEnabled: {
      'agent/yeoni-cloud-browser-qa-20261027': false,
      'agent/yeoni-japanese-ci-20261110': false,
    } },
  });
  // Official contract: unspecified branches retain their existing/default enabled behavior.
  for (const other of ['main', 'agent/fitness-record-priority', 'agent/yeoni-cat-animation-poc', 'agent/drawing-simple']) {
    assert.equal(Object.hasOwn(config.git.deploymentEnabled, other), false);
  }
});

test('focused browser lane keeps loopback fixture, zero retries, no raw traces and narrow public evidence', () => {
  const config = readFileSync('tests/browser-cloud/playwright.config.ts', 'utf8');
  assert.match(config, /baseURL: 'http:\/\/127\.0\.0\.1:3107'/);
  assert.match(config, /retries: 0/);
  assert.match(config, /globalTimeout: 12 \* 60_000/);
  assert.match(config, /trace: 'off', screenshot: 'off', video: 'off'/);
  assert.doesNotMatch(config, /channel:|msedge|ignoreHTTPSErrors/);
  const server = readFileSync('scripts/browser-qa/cloud/server.mjs', 'utf8');
  assert.match(server, /server\.listen\(3107, '127\.0\.0\.1'\)/);
  assert.match(server, /const assets = new Map/);
  assert.doesNotMatch(server, /process\.env\.[A-Z_]*(?:KEY|TOKEN|SECRET)/);
});

test('standalone practice bundle explicitly isolates environment without replacing product components or external-origin denial', () => {
  const lint = readFileSync('eslint.config.mjs', 'utf8');
  assert.ok(lint.includes('".e2e/component-browser/site/**"'));
  assert.doesNotMatch(lint, /["'](?:tests|scripts\/browser-qa\/cloud|app)\/\*\*["']/);
  const build = readFileSync('scripts/browser-qa/cloud/build.mjs', 'utf8');
  const expected = {
    NODE_ENV: '"production"',
    NEXT_PUBLIC_SUPABASE_URL: 'undefined',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'undefined',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'undefined',
    __NEXT_ROUTER_BASEPATH: '""',
    __NEXT_I18N_SUPPORT: 'false',
    __NEXT_LINK_NO_TOUCH_START: 'false',
    __NEXT_MANUAL_CLIENT_BASE_PATH: 'false',
    __NEXT_MANUAL_TRAILING_SLASH: 'false',
    __NEXT_TRAILING_SLASH: 'false',
  };
  for (const [key, value] of Object.entries(expected)) assert.ok(build.includes(`'process.env.${key}': '${value}'`), key);
  assert.equal(build.match(/'process\.env\./g)?.length, Object.keys(expected).length);
  assert.doesNotMatch(build, /\.\.\.process\.env|JSON\.stringify\(process\.env|plugins:|alias:|inject:/);
  assert.match(build, /entryPoints: \['scripts\/browser-qa\/cloud\/entry\.tsx'\]/);
  assert.match(build, /outputDirectory = resolve\('\.e2e\/component-browser\/site'\)/);
  const practice = readFileSync('scripts/browser-qa/cloud/PracticeFixture.tsx', 'utf8');
  assert.match(practice, /import PracticeWorkspace from '\.\.\/\.\.\/\.\.\/app\/language\/practice\/PracticeWorkspace'/);
  assert.match(practice, /<PracticeWorkspace key=\{`\$\{owner\}:\$\{mount\}`\} owner=\{owner\} transport=\{transport\}/);
  const isolation = readFileSync('tests/browser-cloud/fixture.ts', 'utf8');
  assert.match(isolation, /url\.origin === 'http:\/\/127\.0\.0\.1:3107'/);
  assert.match(isolation, /route\.abort\('blockedbyclient'\)/);
});

test('CI preserves private manual lanes and the exact full suite commands without deployment authority', () => {
  const workflow = readFileSync('.github/workflows/browser-verification.yml', 'utf8');
  type Stage = { id: string; command: string; cleanup: boolean };
  const stages = JSON.parse(readFileSync('scripts/qa-private-stages.json', 'utf8')) as Record<string, Stage[]>;
  function verify(source: string, lanes: Record<string, Stage[]>) {
    const require = (condition: boolean, message: string) => assert.ok(condition, message);
    require(createHash('sha256').update(source).digest('hex') === '57acf9e3f314a9dce41b63878c08dcb45763926839c4ae5f3a7572cdde6977c4', 'Only the complete reviewed manual workflow is accepted');
    require(/^'on':\n  workflow_dispatch: null\npermissions:/m.test(source), 'Only explicit manual dispatch may start browser verification');
    require(!/\b(?:pull_request_target|push):|^  pull_request:/m.test(source), 'No automatic browser trigger');
    require(/permissions:\n  contents: read\nconcurrency:/.test(source), 'Read-only repository permission is preserved');
    require(!/secrets\.|write-all|contents: write|--prod|vercel deploy|upload-artifact|retention-days:|actions\/cache|^\s+cache:/.test(source), 'No secret, deployment, artifact or cache expansion');
    require((source.match(/package-manager-cache: false/g) || []).length === 2, 'Automatic npm cache is disabled in both lanes');
    require((source.match(/persist-credentials: 'false'/g) || []).length === 4, 'Checkout never persists credentials');
    require((source.match(/actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/g) || []).length === 4, 'Reviewed checkout action pins are preserved');
    require((source.match(/actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/g) || []).length === 2, 'Reviewed setup action pins are preserved');
    require((source.match(/ref: 25eac153004f777581ca2d95e31a02ca96844332/g) || []).length === 2, 'Reviewed WebKit library pin is preserved');
    const focused = source.split('  focused-components:')[1]?.split('\n  browser:')[0] || '';
    const browser = source.split('\n  browser:')[1] || '';
    require(/timeout-minutes: 25/.test(focused) && /timeout-minutes: 105/.test(browser), 'Original lane time budgets are preserved');
    require(/YEONI_COMPONENT_QA: '1'/.test(focused), 'Component fixture stays explicit');
    require((source.match(/^\s+run:/gm) || []).length === 2, 'All application commands are supervised');
    for (const lane of ['focused-components', 'browser']) {
      require(source.includes(`run: node scripts/qa-private-orchestrator.mjs ${lane}`), 'Each lane uses the reviewed private supervisor');
      require(Array.isArray(lanes[lane]), 'Both staged command lists are present');
    }
    require(Object.keys(lanes).length === 2, 'No unreviewed command lane');
    // Frozen reviewed stage arrays include every command byte, order, stage ID and
    // cleanup flag: full Chromium/WebKit suite, selected repeated batches, setup,
    // synthetic supervisor preflight and unconditional stack stop. Any intentional
    // command change requires renewed review, not silently relaxed substring checks.
    const expected = {
      'focused-components': '403299fa2f8a5dcb23e81b94f338c7f1bb540e53a3852f8c707e0ee1db994868',
      browser: '123bd17406219596241748193897dfc5f1cb5bf6569aa5086b9cba7fd9bc8119',
    };
    for (const [lane, digest] of Object.entries(expected)) {
      require(createHash('sha256').update(JSON.stringify(lanes[lane])).digest('hex') === digest, 'Reviewed command order, content and cleanup flags are preserved');
    }
  }
  verify(workflow, stages);
  // Negative controls prove privacy and previous coverage cannot be removed to pass.
  for (const changed of [workflow.replace('workflow_dispatch: null', 'push: null'),
    workflow.replace('contents: read', 'contents: write'), workflow.replace('timeout-minutes: 105', 'timeout-minutes: 25'),
    workflow.replace('timeout-minutes: 25', 'timeout-minutes: 24'),
    workflow.replace('timeout-minutes: 105', 'timeout-minutes: 1050'),
    workflow.replace('  browser:\n', '  browser:\n    permissions:\n      id-token: write\n'),
    `${workflow}\n    - uses: unreviewed/action@latest\n`, workflow.replace('package-manager-cache: false', 'package-manager-cache: true'),
    workflow.replace("persist-credentials: 'false'", "persist-credentials: 'true'"),
    workflow.replace('run: node scripts/qa-private-orchestrator.mjs browser', 'run: npm test'),
    `${workflow}\n    - uses: actions/upload-artifact@unreviewed\n`]) {
    assert.throws(() => verify(changed, stages), { name: 'AssertionError' });
  }
  for (const mutate of [
    (lane: Stage[]) => lane.pop(),
    (lane: Stage[]) => { lane[0].command = 'true'; },
    (lane: Stage[]) => { lane[lane.length - 1].cleanup = false; },
    (lane: Stage[]) => lane.reverse(),
    (lane: Stage[]) => { const full = lane.find(stage => stage.command === 'node scripts/qa-playwright.mjs'); if (full) full.command += ' --project=chromium'; },
  ]) {
    const changed = structuredClone(stages); mutate(changed.browser);
    assert.throws(() => verify(workflow, changed), { name: 'AssertionError' });
  }
});

test('body import browser fixture uses an explicit reader boundary without replacing production modules', () => {
  const component = readFileSync('app/components/BodyRecordCard.tsx', 'utf8');
  assert.match(component, /readReport\?: typeof parseOaReport/);
  assert.match(component, /readReport = parseOaReport/);
  assert.match(component, /await readReport\(file,/);
  const fixture = readFileSync('scripts/browser-qa/cloud/BodyImportFixture.tsx', 'utf8');
  assert.match(fixture, /import BodyRecordCard from '\.\.\/\.\.\/\.\.\/app\/components\/BodyRecordCard'/);
  assert.match(fixture, /readReport=\{readSyntheticReport\}/);
  const observations = readFileSync('scripts/browser-qa/cloud/body-import-ocr.ts', 'utf8');
  assert.match(observations, /import \{ recoveredNumber, type OaReportResult \} from '\.\.\/\.\.\/\.\.\/app\/lib\/oaReportParser\.ts'/);
  assert.doesNotMatch(observations, /fetch\(|localStorage|sessionStorage|process\.env/);
});
