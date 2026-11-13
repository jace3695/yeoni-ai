export const titles = Object.freeze([
  'water-only save excludes unanswered protein while explicit zero persists and calendar translates statuses',
  'ambiguous legacy zero is not silently reclassified when merely viewed or reloaded',
  'new Japanese application lesson answers appended questions through reload save and relogin',
  'legacy Japanese application lesson keeps original question identities through reload and relogin',
  'foam unanswered timing and pain remain absent through save reload and calendar edits',
  'sentence polite endings avoid particle filter and both show-all controls reset filters without saving',
  'daily review save control follows the displayed date and prevents same-date duplicates after rollover',
]);
export const sources = Object.freeze(Object.fromEntries(titles.map((title, index) => [title, index < 2 ? 'diet-protein-response.spec.ts' : index < 4 ? 'japanese-application-plan.spec.ts' : 'safety-ux-followup.spec.ts'])));
export const project = 'chromium-diet-regression';
export const command = 'node node_modules/@playwright/test/cli.js test --config playwright.diet-regression.config.ts --project chromium-diet-regression';
export function accepted(report, token) {
  return report && Object.keys(report).sort().join(',') === 'cleaned,passed,status,token,total'
    && report.token === token && report.status === 'passed' && report.total === 7 && report.passed === 7 && report.cleaned === 7;
}
