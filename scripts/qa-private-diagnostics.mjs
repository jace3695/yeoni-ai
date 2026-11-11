import { appendFileSync, constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { sources } from './qa-private-source-ids.mjs';

const maxBytes = 1024 * 1024, maxCount = 10000, maxInvocations = 32, maxDetails = 20;
const statuses = ['passed', 'failed', 'timedOut', 'skipped', 'interrupted', 'unknown'];
const endings = ['passed', 'failed', 'timedout', 'interrupted', 'unknown'];
const projects = ['chromium', 'webkit-small', 'auth-preservation', 'webkit-diagnostic-denial', 'chromium-app-smoke'];
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
const counts = () => Object.fromEntries(statuses.map(status => [status, 0]));

const failureCategories = ['test-error', 'timeout', 'interrupted'];
const operationCategories = ['expect', 'pw-api'];
const failureStatus = status => ['failed', 'timedOut', 'interrupted'].indexOf(status) + 1;
// Inspect only own data fields of the existing allowlisted diagnostic object.
// Do not invoke getters, toJSON, iterators or inspect the native error contents.
const field = (value, key) => {
  try { return value !== null && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined; }
  catch { return undefined; }
};
const array = value => { try { return Array.isArray(value) ? value : []; } catch { return []; } };
const arraySize = value => { const size = field(value, 'length'); return integer(size, 0, 4294967295) ? size : 0; };
const sourceLocation = (value, root) => {
  const file = field(value, 'file'), line = field(value, 'line'), column = field(value, 'column');
  const source = sources.findIndex(known => file === known || file === `${root}/${known}`) + 1;
  return source && integer(line, 1, 1000000) && integer(column, 1, 1000000) ? { source, line, column } : undefined;
};
function numericFailure(value, item, status, root) {
  const category = failureStatus(status), definition = sourceLocation(field(value, 'testDefinition'), root);
  if (!category || field(value, 'category') !== failureCategories[category - 1] || !definition
    || !['source', 'line', 'column'].every(key => definition[key] === item[key])) return;
  const sameSource = value => {
    const at = sourceLocation(value, root);
    return at?.source === item.source ? at : undefined;
  };
  const rawErrors = array(field(value, 'errors')), rawSteps = array(field(value, 'failedSteps'));
  const rawOperations = array(field(value, 'failedOperations'));
  const errors = [], failedSteps = [], failedOperations = [];
  for (let index = 0; index < 3; index++) {
    const error = sameSource(field(field(rawErrors, String(index)), 'location'));
    if (error) errors.push(error);
    const step = sameSource(field(rawSteps, String(index)));
    if (step) failedSteps.push(step);
    const operation = field(rawOperations, String(index)), at = sameSource(field(operation, 'location'));
    const nativeCategory = field(operation, 'category'), durationMs = field(operation, 'durationMs');
    const category = ['expect', 'pw:api'].indexOf(nativeCategory) + 1;
    if (at && category && integer(durationMs, 0, 1000000)) failedOperations.push({ ...at, category, durationMs });
  }
  const omitted = field(value, 'omittedErrors');
  return { category, errors, omittedErrors: Math.min(1000000,
    (integer(omitted, 0, 1000000) ? omitted : 0) + Math.max(0, arraySize(rawErrors) - 3)),
  failedSteps, failedOperations, stepScanTruncated: field(value, 'stepScanTruncated') === true
    || arraySize(rawSteps) > 3 || arraySize(rawOperations) > 3 ? 1 : 0 };
}
function validatedFailure(value, item, status) {
  if (!exact(value, ['category', 'errors', 'omittedErrors', 'failedSteps', 'failedOperations', 'stepScanTruncated'])
    || !failureStatus(status) || value.category !== failureStatus(status)
    || !integer(value.omittedErrors, 0, 1000000) || !integer(value.stepScanTruncated, 0, 1)) throw 0;
  const location = value => integer(value.source, 1, sources.length) && value.source === item.source
    && integer(value.line, 1, 1000000) && integer(value.column, 1, 1000000);
  const entries = (values, operation = false) => {
    if (!Array.isArray(values) || values.length > 3) throw 0;
    return values.map(value => {
      if (!exact(value, operation ? ['source', 'line', 'column', 'category', 'durationMs'] : ['source', 'line', 'column'])
        || !location(value) || (operation && (!integer(value.category, 1, operationCategories.length)
          || !integer(value.durationMs, 0, 1000000)))) throw 0;
      return { source: value.source, line: value.line, column: value.column,
        ...(operation ? { category: value.category, durationMs: value.durationMs } : {}) };
    });
  };
  return { category: value.category, errors: entries(value.errors), omittedErrors: value.omittedErrors,
    failedSteps: entries(value.failedSteps), failedOperations: entries(value.failedOperations, true),
    stepScanTruncated: value.stepScanTruncated };
}

export function diagnosticInvocations(command) {
  return command.split('\n').filter(line => line === 'npx playwright test --config tests/browser-cloud/playwright.config.ts'
    || line === 'node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts:3 tests/e2e/sync.spec.ts:3 tests/e2e/language-sync.spec.ts:8 tests/e2e/language-reset.spec.ts:39 tests/e2e/japanese-answer-persistence.spec.ts:8 tests/e2e/daily-review-completion.spec.ts:3 tests/e2e/language-reset-receipts.spec.ts:9 tests/e2e/japanese-middle-reading.spec.ts:3 tests/e2e/japanese-upper-reading.spec.ts:3 --config playwright.chromium-smoke.config.ts --project chromium-app-smoke'
    || /^node scripts\/qa-playwright\.mjs(?: |$)/.test(line)).length;
}

// This is a separate channel from legacy local evidence, stdout and GitHub
// command files. Its input path/token are supplied only by the supervisor.
export class PrivateDiagnostics {
  constructor({ env = process.env, root = process.cwd() } = {}) {
    this.path = env.QA_PRIVATE_DIAGNOSTIC_FILE;
    this.token = env.QA_PRIVATE_DIAGNOSTIC_TOKEN;
    this.root = root;
    this.nextTest = 0;
    this.tests = new WeakMap();
    this.enabled = typeof this.path === 'string' && /^[0-9a-f]{64}$/.test(this.token ?? '');
    this.write({ event: 'start' });
  }
  write(fields) {
    if (!this.enabled) return;
    try {
      appendFileSync(this.path, JSON.stringify({ token: this.token, ...fields }) + '\n',
        { flag: constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW });
    } catch { this.enabled = false; } // Missing/incomplete channel is reported by the supervisor.
  }
  onTestBegin(test) {
    if (!this.enabled) return;
    const input = test.location;
    const source = sources.findIndex(file => input?.file === file || input?.file === `${this.root}/${file}`) + 1;
    const valid = source > 0 && integer(input?.line, 1, 1000000) && integer(input?.column, 1, 1000000);
    const item = { test: ++this.nextTest, source: valid ? source : 0, line: valid ? input.line : 0,
      column: valid ? input.column : 0, project: projects.indexOf(test.parent?.project()?.name) + 1 };
    this.tests.set(test, item);
    this.write({ event: 'begin', ...item });
  }
  onTestEnd(test, result, safeFailure) {
    if (!this.enabled) return;
    if (!this.tests.has(test)) this.onTestBegin(test);
    const item = this.tests.get(test), status = statuses.includes(result.status) ? result.status : 'unknown';
    const failure = numericFailure(safeFailure, item, status, this.root);
    this.write({ event: 'result', test: item.test, status, ...(failure ? { failure } : {}) });
    this.tests.delete(test);
  }
  onError() { this.write({ event: 'error' }); }
  onEnd(result) { this.write({ event: 'end', status: endings.includes(result.status) ? result.status : 'unknown' }); }
}

// Treat every byte written by the child as untrusted. Validate a finite schema,
// then construct new output using only constants and bounded numbers. Never
// forward a JSON fragment or child string, even when the producer is ours.
export function parseDiagnosticJournal(text, token, expected, inventory) {
  if (inventory !== undefined && (!Array.isArray(inventory) || inventory.length !== 9 || expected !== 1
    || inventory.some(item => !exact(item, ['source', 'line', 'column', 'project'])
      || !integer(item.source, 1, sources.length) || !integer(item.line, 1, 1000000)
      || !integer(item.column, 1, 1000000) || !integer(item.project, 1, projects.length))
    || new Set(inventory.map(item => JSON.stringify([item.source, item.line, item.column, item.project]))).size !== inventory.length)) {
    return { report: 'invalid', invocations: [] };
  }
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return { report: 'invalid', invocations: [] };
  if (Buffer.byteLength(text) > maxBytes || !integer(expected, 1, maxInvocations)) return { report: 'invalid', invocations: [] };
  if (!text) return { report: 'missing', invocations: [] };
  if (!text.endsWith('\n')) return { report: 'invalid', invocations: [] };
  const invocations = [];
  let current;
  try {
    for (const line of text.slice(0, -1).split('\n')) {
      const entry = JSON.parse(line);
      if (!record(entry) || entry.token !== token) throw 0;
      if (entry.event === 'start') {
        if (!exact(entry, ['token', 'event']) || current || invocations.length >= expected) throw 0;
        current = { status: 'running', counts: counts(), runnerErrors: 0, details: [], omitted: 0, active: new Map(), nextTest: 0, seen: new Set() };
        invocations.push(current);
      } else {
        if (!current) throw 0;
        if (entry.event === 'begin') {
          if (!exact(entry, ['token', 'event', 'test', 'source', 'line', 'column', 'project'])
            || !integer(entry.test, 1, maxCount) || entry.test !== current.nextTest + 1
            || !integer(entry.source, 0, sources.length) || !integer(entry.project, 0, projects.length)
            || !integer(entry.line, entry.source ? 1 : 0, entry.source ? 1000000 : 0)
            || !integer(entry.column, entry.source ? 1 : 0, entry.source ? 1000000 : 0)
            || current.active.size >= maxDetails) throw 0;
          if (inventory) {
            const index = inventory.findIndex(item => ['source', 'line', 'column', 'project'].every(key => item[key] === entry[key]));
            if (index < 0 || current.seen.has(index)) throw 0;
            current.seen.add(index);
          }
          current.nextTest = entry.test;
          current.active.set(entry.test, { test: entry.test, source: entry.source, line: entry.line,
            column: entry.column, project: entry.project });
        } else if (entry.event === 'result') {
          const hasFailure = Object.hasOwn(entry, 'failure');
          if (!exact(entry, hasFailure ? ['token', 'event', 'test', 'status', 'failure'] : ['token', 'event', 'test', 'status'])
            || !current.active.has(entry.test) || !statuses.includes(entry.status)) throw 0;
          const item = current.active.get(entry.test);
          const failure = hasFailure ? validatedFailure(entry.failure, item, entry.status) : undefined;
          current.active.delete(entry.test);
          current.counts[entry.status]++;
          if (['failed', 'timedOut', 'interrupted', 'unknown'].includes(entry.status)) {
            if (current.details.length < maxDetails) current.details.push({ ...item, status: statuses[statuses.indexOf(entry.status)], ...(failure ? { failure } : {}) });
            else current.omitted++;
          }
        } else if (entry.event === 'error') {
          if (!exact(entry, ['token', 'event']) || current.runnerErrors === maxCount) throw 0;
          current.runnerErrors++;
        } else if (entry.event === 'end') {
          if (!exact(entry, ['token', 'event', 'status']) || !endings.includes(entry.status)) throw 0;
          current.status = endings[endings.indexOf(entry.status)];
          // Preserve unfinished tests on global timeout/runner interruption.
          // A nominal pass with unfinished/failing tests is inconsistent.
          if (current.status === 'passed' && (current.active.size || current.runnerErrors
            || current.counts.failed || current.counts.timedOut || current.counts.interrupted || current.counts.unknown)) throw 0;
          // A narrow smoke lane must complete its exact inventory, including teardown.
          if (inventory && current.status === 'passed' && (current.seen.size !== inventory.length
            || current.counts.passed !== inventory.length || current.counts.skipped)) throw 0;
          current = undefined;
        } else throw 0;
      }
    }
  } catch { return { report: 'invalid', invocations: [] }; }
  return { report: current ? 'incomplete' : invocations.length === expected ? 'complete' : 'partial',
    invocations: invocations.map(item => ({ status: item.status, counts: item.counts, runnerErrors: item.runnerErrors,
      details: item.details, omitted: item.omitted, active: [...item.active.values()] })) };
}

export async function readDiagnosticJournal(path, token, expected, inventory) {
  let handle;
  try {
    // Bound the actual read, reject symlinks/devices and never follow a child-
    // supplied path. This file was created before spawning the child.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size > maxBytes) return { report: 'invalid', invocations: [] };
    const buffer = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > maxBytes) return { report: 'invalid', invocations: [] };
    return parseDiagnosticJournal(buffer.subarray(0, size).toString('utf8'), token, expected, inventory);
  } catch { return { report: 'missing', invocations: [] }; }
  finally { await handle?.close(); }
}

export async function emitDiagnosticJournal({ path, token, expected, stage, termination, emit, inventory }) {
  const report = await readDiagnosticJournal(path, token, expected, inventory);
  // stage/termination originate in the supervisor, not in the journal.
  emit(`${stage} diagnostics report=${report.report} expected=${expected} observed=${report.invocations.length} termination=${termination}`);
  for (const [index, item] of report.invocations.entries()) {
    const prefix = `${stage} invocation=${index + 1}`;
    emit(`${prefix} status=${item.status} ${statuses.map(status => `${status}=${item.counts[status]}`).join(' ')} runnerErrors=${item.runnerErrors} omitted=${item.omitted} active=${item.active.length}`);
    for (const detail of [...item.details, ...item.active.map(active => ({ ...active, status: 'running' }))]) {
      emit(`${prefix} test=${detail.test} source=${detail.source} line=${detail.line} column=${detail.column} project=${detail.project} status=${detail.status}`);
      if (detail.failure) {
        const failure = detail.failure, at = `${prefix} test=${detail.test}`;
        emit(`${at} failure=${failureCategories[failure.category - 1]} omittedErrors=${failure.omittedErrors} stepScanTruncated=${failure.stepScanTruncated}`);
        for (const [index, error] of failure.errors.entries()) {
          emit(`${at} error=${index + 1} source=${error.source} line=${error.line} column=${error.column}`);
        }
        for (const [index, step] of failure.failedSteps.entries()) {
          emit(`${at} phase=${index + 1} source=${step.source} line=${step.line} column=${step.column}`);
        }
        for (const [index, operation] of failure.failedOperations.entries()) {
          emit(`${at} operation=${index + 1} source=${operation.source} line=${operation.line} column=${operation.column} category=${operationCategories[operation.category - 1]} durationMs=${operation.durationMs}`);
        }
      }
    }
  }
  return report;
}
