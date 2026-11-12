// @ts-check
import { check } from './boundary.mjs';
export const labels = ['auth', 'app-state', 'language-state', 'transactions', 'sign-out', 'cleanup'];
const states = ['not-run', 'passed', 'failed'];
const bounded = value => Number.isInteger(value) && value >= 0 && value <= 2;
export function emptyReport() {
  return { version: 1, browserRun: false, scenarios: labels.map(() => 'not-run'), created: 0, removed: 0, cleanupVerified: false };
}
export function parseReport(text, token) {
  check(Buffer.byteLength(text) <= 2048);
  const record = JSON.parse(text);
  check(record && Object.keys(record).sort().join(',') === 'browserRun,cleanupVerified,created,removed,scenarios,token,version');
  check(record.token === token && record.version === 1 && record.browserRun === false);
  check(Array.isArray(record.scenarios) && record.scenarios.length === labels.length && record.scenarios.every(item => states.includes(item)));
  check(bounded(record.created) && bounded(record.removed) && record.removed <= record.created && typeof record.cleanupVerified === 'boolean');
  check(record.cleanupVerified === (record.scenarios[5] === 'passed'));
  check(record.scenarios[0] !== 'passed' || record.created === 2);
  check(!record.cleanupVerified || record.created === record.removed);
  // Reconstruct every public field. No child-supplied string is forwarded.
  return { ...emptyReport(), scenarios: record.scenarios.map(item => states[states.indexOf(item)]),
    created: record.created, removed: record.removed, cleanupVerified: record.cleanupVerified };
}
export function publicLines(report) {
  return ['isolated-auth-api browserRun=false', ...labels.map((label, index) => `isolated-auth-api ${label} ${report.scenarios[index]}`),
    `isolated-auth-api created=${report.created} removed=${report.removed} cleanupVerified=${report.cleanupVerified ? 'true' : 'false'}`];
}
export const reportPassed = report => report.scenarios.every(item => item === 'passed') && report.created === 2 && report.removed === 2 && report.cleanupVerified;
