import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { titles, sources, project, stageLimits } from './manifest.mjs';
export default class Reporter {
  invalid = false; seen = new Set(); cleaned = new Set(); buffers = new Map(); total = 0; outcomes = Array(7).fill(0); stages = Array(7).fill(0);
  onBegin(config, suite) {
    const all = suite.allTests(); this.total = all.length;
    this.invalid ||= all.length !== 7 || config.workers !== 1 || config.forbidOnly !== true;
    const names = new Set();
    for (const t of all) {
      this.invalid ||= !titles.includes(t.title) || names.has(t.title) || basename(t.location.file) !== sources[t.title]
        || t.parent.project()?.name !== project || t.retries !== 0 || t.repeatEachIndex !== 0 || t.expectedStatus !== 'passed';
      names.add(t.title);
    }
  }
  onStdOut(chunk, test) {
    if (!test) return;
    let pending = (this.buffers.get(test.id) || '') + chunk.toString();
    if (pending.length > 65536) { this.invalid = true; return; }
    const lines = pending.split('\n'); this.buffers.set(test.id, lines.pop());
    for (const line of lines) if (line.startsWith('QA_CLEANUP ')) {
      try {
        const v = JSON.parse(line.slice(11));
        if (v.title !== test.title || !titles.includes(v.title) || this.cleaned.has(v.title)
          || v.accountsRemoved !== 1 || v.rowsRemaining !== 0 || v.storageFilesRemoved !== 0
          || !Array.isArray(v.blockedOrigins) || v.blockedOrigins.length !== 0
          || !Number.isInteger(v.realResponses) || v.realResponses < 1) this.invalid = true;
        else this.cleaned.add(v.title);
      } catch { this.invalid = true; }
    }
  }
  onStepEnd(test, result, step) {
    const index=titles.indexOf(test.title);
    if(index<0 || stageLimits[index]===0 || step.category!=='test.step')return;
    const match=/^QA_STAGE_([0-9]{2})$/.exec(step.title);
    if(!match)return;
    const stage=Number(match[1]);
    if(step.error || stage!==this.stages[index]+1 || stage>stageLimits[index]) {this.invalid=true;return;}
    this.stages[index]=stage;
  }
  onTestEnd(test, result) {
    const index=titles.indexOf(test.title);
    if(index>=0)this.outcomes[index]=({passed:1,failed:2,timedOut:3,skipped:4,interrupted:5})[result.status] ?? 6;
    this.invalid ||= result.status !== 'passed' || result.retry !== 0 || this.seen.has(test.title)
      || !titles.includes(test.title) || result.errors.length > 0;
    this.seen.add(test.title);
  }
  onError() { this.invalid = true; }
  onEnd(result) {
    const status = !this.invalid && result.status === 'passed' && this.total === 7 && this.seen.size === 7 && this.cleaned.size === 7 ? 'passed' : 'failed';
    try {
      const token = process.env.YEONI_DIET_RECEIPT_TOKEN;
      if (!/^[a-f0-9]{64}$/.test(token || '') || !process.env.YEONI_DIET_RECEIPT_FILE) throw new Error('missing receipt');
      writeFileSync(process.env.YEONI_DIET_RECEIPT_FILE, JSON.stringify({ token, status, total:this.total, passed:this.outcomes.filter(code=>code===1).length, cleaned:this.cleaned.size, cases:titles.map((title,index)=>({index:index+1,status:this.outcomes[index],stage:this.stages[index],cleanup:this.cleaned.has(title)?1:0})) }), { mode:0o600, flag:'wx' });
    } catch { return { status:'failed' }; }
    return { status };
  }
}
