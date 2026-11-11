import { appendFileSync, constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { sources } from './qa-private-source-ids.mjs';

const maxBytes = 1024 * 1024, maxCount = 10000, maxInvocations = 32, maxDetails = 20;
const statuses = ['passed', 'failed', 'timedOut', 'skipped', 'interrupted', 'unknown'];
const endings = ['passed', 'failed', 'timedout', 'interrupted', 'unknown'];
const projects = ['chromium', 'webkit-small', 'auth-preservation', 'webkit-diagnostic-denial'];
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
const counts = () => Object.fromEntries(statuses.map(status => [status, 0]));

export function diagnosticInvocations(command) {
  return command.split('\n').filter(line => line === 'npx playwright test --config tests/browser-cloud/playwright.config.ts'
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
  onTestEnd(test, result) {
    if (!this.enabled) return;
    if (!this.tests.has(test)) this.onTestBegin(test);
    this.write({ event: 'result', test: this.tests.get(test).test,
      status: statuses.includes(result.status) ? result.status : 'unknown' });
    this.tests.delete(test);
  }
  onError() { this.write({ event: 'error' }); }
  onEnd(result) { this.write({ event: 'end', status: endings.includes(result.status) ? result.status : 'unknown' }); }
}

// Treat every byte written by the child as untrusted. Validate a finite schema,
// then construct new output using only constants and bounded numbers. Never
// forward a JSON fragment or child string, even when the producer is ours.
export function parseDiagnosticJournal(text, token, expected) {
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
        current = { status: 'running', counts: counts(), runnerErrors: 0, details: [], omitted: 0, active: new Map(), nextTest: 0 };
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
          current.nextTest = entry.test;
          current.active.set(entry.test, { test: entry.test, source: entry.source, line: entry.line,
            column: entry.column, project: entry.project });
        } else if (entry.event === 'result') {
          if (!exact(entry, ['token', 'event', 'test', 'status']) || !current.active.has(entry.test) || !statuses.includes(entry.status)) throw 0;
          const item = current.active.get(entry.test);
          current.active.delete(entry.test);
          current.counts[entry.status]++;
          if (['failed', 'timedOut', 'interrupted', 'unknown'].includes(entry.status)) {
            if (current.details.length < maxDetails) current.details.push({ ...item, status: statuses[statuses.indexOf(entry.status)] });
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
          current = undefined;
        } else throw 0;
      }
    }
  } catch { return { report: 'invalid', invocations: [] }; }
  return { report: current ? 'incomplete' : invocations.length === expected ? 'complete' : 'partial',
    invocations: invocations.map(item => ({ status: item.status, counts: item.counts, runnerErrors: item.runnerErrors,
      details: item.details, omitted: item.omitted, active: [...item.active.values()] })) };
}

export async function readDiagnosticJournal(path, token, expected) {
  let handle;
  try {
    // Bound the actual read, reject symlinks/devices and never follow a child-
    // supplied path. This file was created before spawning the child.
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) return { report: 'invalid', invocations: [] };
    const buffer = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > maxBytes) return { report: 'invalid', invocations: [] };
    return parseDiagnosticJournal(buffer.subarray(0, size).toString('utf8'), token, expected);
  } catch { return { report: 'missing', invocations: [] }; }
  finally { await handle?.close(); }
}

export async function emitDiagnosticJournal({ path, token, expected, stage, termination, emit }) {
  const report = await readDiagnosticJournal(path, token, expected);
  // stage/termination originate in the supervisor, not in the journal.
  emit(`${stage} diagnostics report=${report.report} expected=${expected} observed=${report.invocations.length} termination=${termination}`);
  for (const [index, item] of report.invocations.entries()) {
    const prefix = `${stage} invocation=${index + 1}`;
    emit(`${prefix} status=${item.status} ${statuses.map(status => `${status}=${item.counts[status]}`).join(' ')} runnerErrors=${item.runnerErrors} omitted=${item.omitted} active=${item.active.length}`);
    for (const detail of [...item.details, ...item.active.map(active => ({ ...active, status: 'running' }))]) {
      emit(`${prefix} test=${detail.test} source=${detail.source} line=${detail.line} column=${detail.column} project=${detail.project} status=${detail.status}`);
    }
  }
  return report;
}
