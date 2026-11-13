export const titles = Object.freeze([
  'water-only save excludes unanswered protein while explicit zero persists and calendar translates statuses',
  'ambiguous legacy zero is not silently reclassified when merely viewed or reloaded',
]);
export const source = 'diet-protein-response.spec.ts';
export const project = 'chromium-diet-regression';
export const command = 'node node_modules/@playwright/test/cli.js test --config playwright.diet-regression.config.ts --project chromium-diet-regression';
export function accepted(report, token) {
  return report && Object.keys(report).sort().join(',') === 'cleaned,passed,status,token,total'
    && report.token === token && report.status === 'passed' && report.total === 2 && report.passed === 2 && report.cleaned === 2;
}
