// Pure structured-event and private-file checks. No child processes, browsers or services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, chmod, symlink, link, rename, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SafetyEventCollector, SafetyJournalWriter, parseSafetyJournal, readSafetyJournal, emitSafetyJournal,
  safetySucceeded, isSafetyStage, safetyByteLimit } from './qa-private-safety-diagnostics.mjs';
import { safetyInventory, safetyCount, safetySources, safetyCommand } from './qa-private-safety-inventory.mjs';
import { stages, inventory, totalTimeoutMs } from './isolated-chromium-smoke/plan.mjs';

const token = 'a'.repeat(64), root = '/fictional/repository';
const canary = 'SYNTHETIC_PRIVATE_eyJ_FAKE_https://private.invalid/::error::CANARY';
const declarations = () => safetyInventory.flatMap(item => Array.from({ length: item.count }, () => item));
const native = (item, test, type = 'test:pass', extra = {}) => ({ type, data: { file: `${root}/${safetySources[item.source - 1]}`,
  line: item.line, column: item.column, testNumber: test, nesting: 0, details: { type: 'test' }, ...extra } });
const events = () => declarations().map((item, index) => native(item, index + 1));
// Global counts are disjoint. Native test:fail includes both failures and cancellation.
const summary = (overrides = {}, success = true) => ({ type: 'test:summary', data: { file: undefined, success,
  counts: { tests: safetyCount, passed: safetyCount, failed: 0, cancelled: 0, skipped: 0, todo: 0, suites: 0, topLevel: safetyCount, ...overrides } } });
const endings = (counts = {}, success = true) => { const file = summary(counts, success); file.data.file = `${root}/${safetySources[3]}`; return [file, summary(counts, success)]; };
const collect = (input = [...events(), ...endings()], finish = true) => {
  const entries = [], collector = new SafetyEventCollector(entry => entries.push(entry), root);
  for (const event of input) collector.accept(event);
  if (finish) collector.finish();
  return { entries, collector };
};
const journal = entries => entries.map(entry => JSON.stringify({ token, ...entry }) + '\n').join('');
const parse = entries => parseSafetyJournal(journal(entries), token);
const safe = value => { const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of [canary, 'PRIVATE', 'https:', '::error::', root, ...safetySources]) assert.ok(!text.includes(secret)); };
const fixture = async action => {
  const directory = await mkdtemp(join(tmpdir(), 'safety-diagnostic-synthetic-'));
  const path = join(directory, 'journal'); await writeFile(path, '', { mode: 0o600 });
  try { await action({ directory, path, identity: await stat(path) }); }
  finally { await rm(directory, { recursive: true, force: true }); }
};

test('safety observation is enabled only by the explicit exact stage command and unchanged lane budgets', () => {
  assert.equal(stages[0].command, safetyCommand); assert.equal(isSafetyStage(stages[0]), true);
  for (const stage of [{ ...stages[0], id: 'stage-02' }, ...['', ' --list', ' --test-name-pattern=x', '\n', ' '].slice(1).map(suffix => ({ ...stages[0], command: safetyCommand + suffix })),
    { ...stages[0], command: 'node --test scripts/isolated-chromium-smoke/safety.test.mjs' }, { ...stages[0], command: 'exit 0' }]) assert.equal(isSafetyStage(stage), false);
  assert.deepEqual(stages.map(item => item.timeoutMs), [120000, 240000, 405000]); assert.equal(totalTimeoutMs, 775000); assert.equal(inventory.length, 20);
});

test('fixed original declaration multiplicities retain all 274 prior controls and separate source identities', () => {
  assert.deepEqual([1, 2, 3, 4].map(source => safetyInventory.filter(item => item.source === source).reduce((sum, item) => sum + item.count, 0)), [11, 12, 210, 41]);
  assert.equal(safetyInventory.filter(item => item.source <= 4).length, 95);
  assert.equal(new Set(safetyInventory.map(item => `${item.source}:${item.line}:${item.column}`)).size, safetyInventory.length);
  assert.equal(Object.isFrozen(safetyInventory), true); assert.ok(safetyInventory.every(Object.isFrozen));
  assert.ok(safetyCount > 274 && safetyCount < 500);
});

test('complete native outcome inventory and final global summary are both required for success', () => {
  const report = parse(collect().entries); assert.equal(report.report, 'complete');
  assert.equal(report.observed, safetyCount); assert.equal(report.counts.passed, safetyCount);
  assert.equal(safetySucceeded(report, 0, 'none'), true); safe(report);
  for (const [code, termination] of [[1, 'none'], [null, 'none'], [0, 'timeout'], [0, 'cancelled'], [0, 'capture-error'], [0, canary]]) assert.equal(safetySucceeded(report, code, termination), false);
});

test('native failure attribution exposes only the exact declaration coordinates and fixed status', () => {
  const input = events(); input[17].type = 'test:fail';
  input[17].data.details.error = { message: canary, stack: canary, cause: canary }; input[17].data.name = canary;
  const report = parse(collect([...input, ...endings({ passed: safetyCount - 1, failed: 1 }, false)]).entries);
  assert.equal(report.report, 'complete'); assert.equal(report.counts.failed, 1); assert.equal(safetySucceeded(report, 0, 'none'), false);
  const item = declarations()[17]; assert.deepEqual(report.details, [{ test: 18, source: item.source, line: item.line, column: item.column, status: 'failed' }]); safe(report);
});

test('names errors causes stacks snippets and unrelated stream payloads are never accessed', () => {
  let reads = 0; const input = events();
  const hostile = { get() { reads++; throw new Error(canary); } };
  for (const event of input) {
    for (const name of ['name', 'message', 'stack', 'cause', 'source']) Object.defineProperty(event.data, name, hostile);
    Object.defineProperty(event.data.details, 'error', hostile);
  }
  const ignored = { type: 'test:stdout' }; Object.defineProperty(ignored, 'data', hostile);
  const report = parse(collect([ignored, ...input, ...endings()]).entries);
  assert.equal(safetySucceeded(report, 0, 'none'), true); assert.equal(reads, 0); safe(report);
});

test('required accessors revoked proxies and malformed native primitives fail closed without coercion', () => {
  let reads = 0; const getter = { get() { reads++; throw new Error(canary); } };
  for (const field of ['file', 'line', 'column', 'testNumber', 'nesting', 'skip', 'todo', 'details']) {
    const input = events(); Object.defineProperty(input[0].data, field, getter);
    const report = parse(collect([...input, ...endings()]).entries); assert.equal(safetySucceeded(report, 0, 'none'), false); safe(report);
  }
  const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(canary); } });
  const report = parse(collect([{ type: 'test:pass', data: hostile }, ...endings()]).entries);
  assert.equal(safetySucceeded(report, 0, 'none'), false);
  for (const event of [{}, { type: canary }, Object.defineProperty({}, 'type', getter)]) {
    assert.equal(safetySucceeded(parse(collect([event, ...events(), ...endings()]).entries), 0, 'none'), false);
  }
  assert.equal(reads, 0); safe(report);
});

test('unknown file nesting coordinates and file-level child deaths never count as declared success', () => {
  for (const override of [{ file: canary }, { line: 1, column: 1 }, { line: Infinity }, { column: '1' }, { nesting: 1 }, { testNumber: 0 }, { details: { type: 'suite' } }, { details: {} }]) {
    const input = events(); Object.assign(input[0].data, override);
    const report = parse(collect([...input, ...endings()]).entries); assert.equal(safetySucceeded(report, 0, 'none'), false); safe(report);
  }
  const death = native({ source: 4, line: 1, column: 1 }, 1, 'test:fail'); death.data.details.error = { message: canary };
  assert.equal(safetySucceeded(parse(collect([death, ...endings({ tests: 1, topLevel: 1, passed: 0, failed: 1 }, false)]).entries), 0, 'none'), false);
});

test('omission duplicate native IDs and excess declaration multiplicity cannot certify an exit-zero pass', () => {
  const original = events();
  for (const input of [original.slice(1), original.slice(0, -1), [...original, original[0]], [original[0], original[0], ...original.slice(2)],
    original.map((entry, index) => index === 1 ? native(declarations()[0], 2) : entry)]) {
    const report = parse(collect([...input, ...endings()]).entries); assert.equal(safetySucceeded(report, 0, 'none'), false); safe(report);
  }
});

test('skipped todo cancelled and native success-false summaries remain failed even when the process exits zero', () => {
  for (const mode of ['skip', 'todo']) {
    const input = events(); input[0].data[mode] = canary;
    const report = parse(collect([...input, ...endings({ passed: safetyCount - 1, [mode === 'skip' ? 'skipped' : 'todo']: 1 })]).entries);
    assert.equal(report.report, 'complete'); assert.equal(safetySucceeded(report, 0, 'none'), false); safe(report);
  }
  const input = events(); input[0].type = 'test:fail';
  const cancelled = parse(collect([...input, ...endings({ passed: safetyCount - 1, cancelled: 1 }, false)]).entries);
  assert.equal(safetySucceeded(cancelled, 0, 'none'), false); safe(cancelled);
  assert.equal(safetySucceeded(parse(collect([...events(), ...endings({}, false)]).entries), 0, 'none'), false);
});

test('missing duplicate disagreeing and late terminal summaries never promote incomplete evidence', () => {
  const [file, global] = endings();
  for (const input of [events(), [...events(), file], [...events(), global], [...events(), file, file, global],
    [...events(), file, global, global], [...events(), file, global, file], [...events(), file, global, events()[0]],
    [...events(), file, summary({ passed: safetyCount - 1 })], [...events(), file, summary({ tests: safetyCount - 1 })],
    [...events(), ...endings({ suites: 1 })], [file, global, ...events()], [...events(), file, events()[0], global]]) {
    const report = parse(collect(input).entries); assert.equal(safetySucceeded(report, 0, 'none'), false); safe(report);
  }
  const { entries, collector } = collect(); const before = journal(entries);
  collector.accept(events()[0]); collector.finish(); assert.equal(journal(entries), before);
});

test('per-file and global summaries must each be present exactly once and agree on every count and success', () => {
  const [file, global] = endings();
  assert.equal(safetySucceeded(parse(collect([...events(), file, global]).entries), 0, 'none'), true);
  for (const [key, value] of [['success', false], ['passed', safetyCount - 1], ['tests', safetyCount - 1], ['failed', 1], ['cancelled', 1], ['skipped', 1], ['todo', 1], ['suites', 1], ['topLevel', 0]]) {
    const [changed] = endings(); if (key === 'success') changed.data.success = value; else changed.data.counts[key] = value;
    assert.equal(safetySucceeded(parse(collect([...events(), changed, global]).entries), 0, 'none'), false);
  }
  const hostile = summary(); hostile.data.file = canary;
  assert.equal(safetySucceeded(parse(collect([...events(), hostile, file, global]).entries), 0, 'none'), false);
});

test('partial signal and timeout outcomes retain bounded completed counts without claiming active execution or completion', () => {
  const partial = collect(events().slice(0, 3), false); const report = parse(partial.entries);
  assert.equal(report.report, 'incomplete'); assert.equal(report.observed, 3); assert.equal(report.counts.passed, 3);
  for (const reason of ['none', 'timeout', 'cancelled', 'runner-error']) assert.equal(safetySucceeded(report, 0, reason), false);
  assert.equal(Object.hasOwn(report, 'active'), false); safe(report);
});

test('journal schema rejects stale tokens injected keys bad boundaries malformed JSON and oversized content', () => {
  const good = journal(collect().entries);
  for (const text of [good.replace(token, 'b'.repeat(64)), good.slice(0, -1), good + good,
    good.replace('"event":"start"', '"event":"start","name":"PRIVATE"'), '{\n', 'x'.repeat(safetyByteLimit + 1),
    good.replace('"status":1', '"status":99'), good.replace('"event":"start"', '"event":"start","event":"start"'), good.replace('"test":1', '"test":1.5')]) {
    const report = parseSafetyJournal(text, token); assert.equal(report.report, 'invalid'); safe(report);
  }
  assert.equal(parseSafetyJournal('', token).report, 'missing'); assert.equal(parseSafetyJournal(good, canary).report, 'invalid');
});

test('failure detail output stays bounded while total failures and omissions remain exact', () => {
  const input = events(); for (const event of input) event.type = 'test:fail';
  const report = parse(collect([...input, ...endings({ passed: 0, failed: safetyCount }, false)]).entries);
  assert.equal(report.report, 'complete'); assert.equal(report.counts.failed, safetyCount);
  assert.equal(report.details.length, 20); assert.equal(report.omitted, safetyCount - 20); safe(report);
});

test('owner-only nonce writer and identity-bound reader roundtrip finite events without raw fields', async () => fixture(async ({ path, identity }) => {
  const writer = new SafetyJournalWriter({ env: { QA_PRIVATE_SAFETY_FILE: path, QA_PRIVATE_SAFETY_TOKEN: token } });
  const collector = new SafetyEventCollector(entry => writer.write(entry), root);
  for (const event of [...events(), ...endings()]) collector.accept(event); collector.finish(); writer.close();
  const report = await readSafetyJournal(path, token, identity); assert.equal(safetySucceeded(report, 0, 'none'), true);
  const bytes = await readFile(path, 'utf8'); safe(bytes.replaceAll(token, '')); assert.ok(Buffer.byteLength(bytes) < safetyByteLimit);
  const output = []; await emitSafetyJournal({ path, token, identity, termination: canary, emit: line => output.push(line) });
  assert.match(output.join('\n'), /^[a-zA-Z0-9 =\-\n]*$/); safe(output);
  assert.equal(output[1], `stage-01 safety passed=${safetyCount} failed=0 skipped=0 todo=0 runnerErrors=0 omitted=0 summarySuccess=1 cancelled=0`);
  const cancelled = events(); cancelled[0].type = 'test:fail';
  for (const [entries, suffix] of [[collect(events().slice(0, 1), false).entries, 'summarySuccess=-1 cancelled=-1'],
    [collect([...events(), ...endings({}, false)]).entries, 'summarySuccess=0 cancelled=0'],
    [collect([...cancelled, ...endings({ passed: safetyCount - 1, cancelled: 1 }, false)]).entries, 'summarySuccess=0 cancelled=1']]) {
    await writeFile(path, journal(entries)); const lines = [];
    await emitSafetyJournal({ path, token, identity, termination: 'none', emit: line => lines.push(line) });
    assert.ok(lines[1].endsWith(suffix)); assert.match(lines.join('\n'), /^[a-zA-Z0-9 =\-\n]*$/); safe(lines);
  }
}));

test('symlink public hardlinked replaced nonfile and oversized journals cannot be read as evidence', async () => fixture(async ({ path, identity, directory }) => {
  await writeFile(path, journal(collect().entries));
  const alias = join(directory, 'alias'); await symlink(path, alias);
  assert.notEqual((await readSafetyJournal(alias, token, identity)).report, 'complete');
  await chmod(path, 0o644); assert.equal((await readSafetyJournal(path, token, identity)).report, 'invalid'); await chmod(path, 0o600);
  const hard = join(directory, 'hard'); await link(path, hard); assert.equal((await readSafetyJournal(path, token, identity)).report, 'invalid'); await rm(hard);
  await rename(path, join(directory, 'old')); await writeFile(path, journal(collect().entries), { mode: 0o600 });
  assert.equal((await readSafetyJournal(path, token, identity)).report, 'invalid');
  await writeFile(path, 'x'.repeat(safetyByteLimit + 1)); assert.equal((await readSafetyJournal(path, token, await stat(path))).report, 'invalid');
  const folder = join(directory, 'folder'); await mkdir(folder); assert.notEqual((await readSafetyJournal(folder, token, await stat(folder))).report, 'complete');
}));

test('writer refuses prepopulated public symlink stale or absent channels and never creates a replacement file', async () => fixture(async ({ path, directory }) => {
  for (const env of [{}, { QA_PRIVATE_SAFETY_FILE: path, QA_PRIVATE_SAFETY_TOKEN: canary }, { QA_PRIVATE_SAFETY_FILE: join(directory, 'absent'), QA_PRIVATE_SAFETY_TOKEN: token }]) {
    const writer = new SafetyJournalWriter({ env }); writer.write({ event: 'start' }); writer.close();
  }
  assert.equal((await stat(path)).size, 0); await assert.rejects(stat(join(directory, 'absent')));
  for (const mode of ['existing', 'public', 'symlink']) {
    await writeFile(path, mode === 'existing' ? 'occupied' : ''); await chmod(path, mode === 'public' ? 0o644 : 0o600);
    const alias = join(directory, 'alias'); if (mode === 'symlink') await symlink(path, alias);
    const writer = new SafetyJournalWriter({ env: { QA_PRIVATE_SAFETY_FILE: mode === 'symlink' ? alias : path, QA_PRIVATE_SAFETY_TOKEN: token } });
    writer.write({ event: 'start' }); writer.close(); assert.equal(await readFile(path, 'utf8'), mode === 'existing' ? 'occupied' : '');
  }
}));

test('writer enforces append ownership and byte ceiling with no post-close or late callback writes', async () => fixture(async ({ path, identity }) => {
  const writer = new SafetyJournalWriter({ env: { QA_PRIVATE_SAFETY_FILE: path, QA_PRIVATE_SAFETY_TOKEN: token } });
  for (let index = 0; index < 5000; index++) writer.write({ event: 'error' });
  assert.ok((await stat(path)).size <= safetyByteLimit); assert.equal(safetySucceeded(await readSafetyJournal(path, token, identity), 0, 'none'), false);
  writer.close(); const size = (await stat(path)).size; writer.write({ event: 'end' }); assert.equal((await stat(path)).size, size);
}));
