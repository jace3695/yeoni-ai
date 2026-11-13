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
// Closed numeric-only protocol. Never carry title, error, URL, page text or arbitrary strings.
export function validReceipt(report, token) {
  return Boolean(report && Object.keys(report).sort().join(',') === 'cases,cleaned,passed,status,token,total'
    && report.token === token && ['passed','failed'].includes(report.status)
    && [report.total,report.passed,report.cleaned].every(n=>Number.isInteger(n)&&n>=0&&n<=7)
    && Array.isArray(report.cases) && report.cases.length===7
    && report.cases.every((item,index)=>item && Object.keys(item).sort().join(',')==='cleanup,index,status'
      && item.index===index+1 && Number.isInteger(item.status)&&item.status>=0&&item.status<=6
      && (item.cleanup===0||item.cleanup===1)));
}
export function accepted(report, token) {
  return validReceipt(report,token) && report.status==='passed' && report.total===7 && report.passed===7 && report.cleaned===7
    && report.cases.every(item=>item.status===1 && item.cleanup===1);
}
export function diagnosticLines(report, token) {
  if(!validReceipt(report,token))return ['regression-cases receipt=unverified'];
  return report.cases.map(item=>`regression-case index=${item.index} status=${item.status} cleanup=${item.cleanup}`);
}
