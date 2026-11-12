import { constants, openSync, fstatSync, writeSync, closeSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { safetySources, safetyInventory, safetyCount, safetyCommand } from './qa-private-safety-inventory.mjs';

export const safetyByteLimit = 256 * 1024;
const maxDetails = 20, maxErrors = 1024;
const statuses = ['passed', 'failed', 'skipped', 'todo'];
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const tokenValid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
const count = () => Object.fromEntries(statuses.map(status => [status, 0]));
const key = value => `${value.source}:${value.line}:${value.column}`;
const expected = new Map(safetyInventory.map(item => [key(item), item.count]));
const inaccessible = Symbol('inaccessible');
// Read only an own data field. Do not invoke accessors, coercion, toJSON, names,
// error objects, causes, stack traces, source snippets or native diagnostic text.
const field = (value, name) => {
  try {
    if (value === null || typeof value !== 'object') return inaccessible;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    return descriptor === undefined ? undefined : Object.hasOwn(descriptor, 'value') ? descriptor.value : inaccessible;
  } catch { return inaccessible; }
};
const privateFile = stat => stat.isFile() && stat.nlink === 1 && (stat.mode & 0o777) === 0o600
  && typeof process.getuid === 'function' && stat.uid === process.getuid();

export function isSafetyStage(stage) { return stage.id === 'stage-01' && stage.command === safetyCommand; }

export class SafetyEventCollector {
  constructor(write, root) {
    this.write = write; this.root = root; this.closed = false; this.next = 0;
    this.errors = 0; this.terminal = false; this.fileTerminal = false; this.write({ event: 'start' });
  }
  error() {
    if (this.closed) return;
    if (++this.errors <= maxErrors) this.write({ event: 'error' });
    else this.closed = true; // No end record means the journal cannot certify success.
  }
  accept(event) {
    if (this.closed) return;
    const type = field(event, 'type');
    if (type === 'test:summary') {
      const data = field(event, 'data'), file = field(data, 'file');
      const fileSummary = file === safetySources[3] || file === `${this.root}/${safetySources[3]}`;
      // Exactly one entry-file summary must precede the matching global summary.
      if (this.terminal || fileSummary && this.fileTerminal
        || !fileSummary && (file !== undefined || !this.fileTerminal)) { this.error(); return; }
      const counts = field(data, 'counts'), success = field(data, 'success');
      const values = {};
      for (const name of ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo', 'suites', 'topLevel']) {
        const value = field(counts, name);
        if (!integer(value, 0, safetyCount)) { this.error(); return; }
        values[name] = value;
      }
      if (typeof success !== 'boolean') { this.error(); return; }
      if (fileSummary) this.fileTerminal = true; else this.terminal = true;
      this.write({ event: fileSummary ? 'file-summary' : 'summary', ...values, success: success ? 1 : 0 });
      return;
    }
    if (['test:enqueue', 'test:dequeue', 'test:start', 'test:complete', 'test:plan',
      'test:diagnostic', 'test:stdout', 'test:stderr', 'test:coverage'].includes(type)) return;
    if (type !== 'test:pass' && type !== 'test:fail' || this.terminal || this.fileTerminal) { this.error(); return; }
    const data = field(event, 'data'), file = field(data, 'file');
    const source = safetySources.findIndex(known => file === known || file === `${this.root}/${known}`) + 1;
    const line = field(data, 'line'), column = field(data, 'column'), test = field(data, 'testNumber');
    const nesting = field(data, 'nesting'), skip = field(data, 'skip'), todo = field(data, 'todo');
    const details = field(data, 'details'), kind = field(details, 'type');
    const flag = value => value === undefined || typeof value === 'boolean' || typeof value === 'string';
    if (!source || !integer(line, 1, 1000000) || !integer(column, 1, 1000000)
      || !expected.has(key({ source, line, column })) || nesting !== 0
      || !integer(test, 1, safetyCount) || test !== this.next + 1
      || !flag(skip) || !flag(todo) || kind !== 'test') {
      this.error(); return;
    }
    this.next = test;
    const status = skip !== undefined && skip !== false ? 3 : todo !== undefined && todo !== false ? 4 : type === 'test:pass' ? 1 : 2;
    this.write({ event: 'result', test, source, line, column, status });
  }
  finish() { if (!this.closed) { this.closed = true; if (this.terminal) this.write({ event: 'end' }); } }
}

export class SafetyJournalWriter {
  constructor({ env = process.env } = {}) {
    this.handle = undefined; this.bytes = 0; this.closed = false;
    this.token = env.QA_PRIVATE_SAFETY_TOKEN;
    const path = env.QA_PRIVATE_SAFETY_FILE;
    if (typeof path !== 'string' || !tokenValid(this.token)) return;
    try {
      this.handle = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = fstatSync(this.handle);
      if (!privateFile(stat) || stat.size !== 0) this.close();
    } catch { this.close(); }
  }
  write(entry) {
    if (this.closed || this.handle === undefined) return;
    try {
      // entry is produced exclusively by SafetyEventCollector from fresh scalars.
      const bytes = Buffer.from(JSON.stringify({ token: this.token, ...entry }) + '\n');
      const stat = fstatSync(this.handle);
      if (!privateFile(stat) || stat.size !== this.bytes || this.bytes + bytes.length > safetyByteLimit) { this.close(); return; }
      let written = 0;
      while (written < bytes.length) {
        const size = writeSync(this.handle, bytes, written, bytes.length - written);
        if (!size) throw 0;
        written += size;
      }
      this.bytes += written;
    } catch { this.close(); }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.handle !== undefined) { try { closeSync(this.handle); } catch { /* No native error text. */ } }
    this.handle = undefined;
  }
}

const empty = report => ({ report, observed: 0, counts: count(), runnerErrors: 0, omitted: 0, details: [], summary: null, fileSummary: null });
export function parseSafetyJournal(text, token) {
  if (!tokenValid(token) || typeof text !== 'string' || Buffer.byteLength(text) > safetyByteLimit) return empty('invalid');
  if (!text) return empty('missing');
  if (!text.endsWith('\n')) return empty('invalid');
  const result = empty('incomplete'), seen = new Map();
  let started = false, ended = false;
  try {
    for (const line of text.slice(0, -1).split('\n')) {
      const entry = JSON.parse(line);
      if (!record(entry) || JSON.stringify(entry) !== line || entry.token !== token || ended
        || result.summary && entry.event !== 'end'
        || result.fileSummary && !['summary', 'end'].includes(entry.event)) throw 0;
      if (entry.event === 'start') {
        if (started || !exact(entry, ['token', 'event'])) throw 0;
        started = true;
      } else {
        if (!started) throw 0;
        if (entry.event === 'result') {
          if (!exact(entry, ['token', 'event', 'test', 'source', 'line', 'column', 'status'])
            || !integer(entry.test, 1, safetyCount) || entry.test !== result.observed + 1
            || !integer(entry.source, 1, safetySources.length) || !integer(entry.line, 1, 1000000)
            || !integer(entry.column, 1, 1000000) || !integer(entry.status, 1, statuses.length)) throw 0;
          const identity = key(entry), occurrences = (seen.get(identity) ?? 0) + 1;
          if (!expected.has(identity) || occurrences > expected.get(identity)) throw 0;
          seen.set(identity, occurrences); result.observed++;
          const status = statuses[entry.status - 1]; result.counts[status]++;
          if (status !== 'passed') {
            if (result.details.length < maxDetails) result.details.push({ test: entry.test, source: entry.source, line: entry.line, column: entry.column, status });
            else result.omitted++;
          }
        } else if (entry.event === 'error') {
          if (!exact(entry, ['token', 'event']) || result.runnerErrors >= maxErrors) throw 0;
          result.runnerErrors++;
        } else if (entry.event === 'summary' || entry.event === 'file-summary') {
          const keys = ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo', 'suites', 'topLevel'];
          if (!exact(entry, ['token', 'event', ...keys, 'success']) || result.summary || entry.event === 'file-summary' && result.fileSummary
            || entry.event === 'summary' && !result.fileSummary
            || keys.some(name => !integer(entry[name], 0, safetyCount)) || !integer(entry.success, 0, 1)
            || entry.suites !== 0 || entry.topLevel !== entry.tests || entry.tests !== result.observed
            || entry.passed !== result.counts.passed || entry.skipped !== result.counts.skipped || entry.todo !== result.counts.todo
            || entry.failed + entry.cancelled !== result.counts.failed
            || entry.tests !== entry.passed + entry.failed + entry.cancelled + entry.skipped + entry.todo
            || entry.success === 1 && (entry.failed !== 0 || entry.cancelled !== 0)) throw 0;
          const values = Object.fromEntries([...keys, 'success'].map(name => [name, entry[name]]));
          if (entry.event === 'file-summary') result.fileSummary = values;
          else {
            if ([...keys, 'success'].some(name => values[name] !== result.fileSummary[name])) throw 0;
            result.summary = values;
          }
        } else if (entry.event === 'end') {
          if (!exact(entry, ['token', 'event']) || !result.summary) throw 0;
          ended = true;
        } else throw 0;
      }
    }
    if (!started) throw 0;
  } catch { return empty('invalid'); }
  result.report = !ended ? 'incomplete' : result.observed === safetyCount
    && safetyInventory.every(item => seen.get(key(item)) === item.count) ? 'complete' : 'partial';
  return result;
}

export async function readSafetyJournal(path, token, identity) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!privateFile(stat) || stat.size > safetyByteLimit || !identity
      || stat.dev !== identity.dev || stat.ino !== identity.ino) return empty('invalid');
    const buffer = Buffer.alloc(safetyByteLimit + 1); let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    const after = await handle.stat();
    if (size > safetyByteLimit || !privateFile(after) || stat.size !== size || after.size !== size) return empty('invalid');
    return parseSafetyJournal(buffer.subarray(0, size).toString('utf8'), token);
  } catch { return empty('missing'); }
  finally { await handle?.close(); }
}

export function safetySucceeded(report, code, termination) {
  return code === 0 && termination === 'none' && report.report === 'complete'
    && report.observed === safetyCount && report.counts.passed === safetyCount && report.runnerErrors === 0
    && report.counts.failed === 0 && report.counts.skipped === 0 && report.counts.todo === 0 && report.summary?.success === 1 && report.summary.cancelled === 0;
}
export async function emitSafetyJournal({ path, token, identity, termination, emit }) {
  const report = await readSafetyJournal(path, token, identity);
  const reason = ['none', 'timeout', 'cancelled', 'capture-error', 'runner-error', 'prepare-error', 'finalize-error'].includes(termination) ? termination : 'runner-error';
  emit(`stage-01 safety report=${report.report} expected=${safetyCount} observed=${report.observed} termination=${reason}`);
  emit(`stage-01 safety ${statuses.map(status => `${status}=${report.counts[status]}`).join(' ')} runnerErrors=${report.runnerErrors} omitted=${report.omitted} summarySuccess=${report.summary?.success ?? -1} cancelled=${report.summary?.cancelled ?? -1}`);
  for (const item of report.details) emit(`stage-01 safety test=${item.test} source=${item.source} line=${item.line} column=${item.column} status=${item.status}`);
  return report;
}
