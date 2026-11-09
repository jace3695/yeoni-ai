const result = document.querySelector('#result'), start = document.querySelector('#start'), save = document.querySelector('#save');
if (!['localhost', '127.0.0.1'].includes(location.hostname) || location.port !== '41871') throw new Error('Use only http://127.0.0.1:41871 for this synthetic harness.');
let channel, runId, report, prepared = new Set(), finished = new Map(), mode;
const write = value => { result.textContent = JSON.stringify(value, null, 2); };
document.querySelector('#prepare').onclick = () => {
  channel?.close(); runId = crypto.randomUUID(); mode = document.querySelector('#mode').value;
  prepared = new Set(); finished = new Map(); report = undefined; start.disabled = true; save.disabled = true;
  const key = `yeoni-compat-synthetic:${runId}`;
  localStorage.setItem(key, JSON.stringify({ count: 0, events: [] }));
  channel = new BroadcastChannel(`yeoni-compat-synthetic:${runId}`);
  channel.onmessage = ({ data }) => {
    if (!data || data.runId !== runId || !['A', 'B'].includes(data.tab)) return;
    if (data.type === 'ready') { prepared.add(data.tab); start.disabled = prepared.size !== 2; write({ status: 'ready', tabs: [...prepared], mode }); }
    if (data.type === 'done') {
      finished.set(data.tab, data);
      if (finished.size === 2) {
        const state = JSON.parse(localStorage.getItem(key));
        const expected = ['A', 'B'].flatMap(tab => Array.from({ length: 100 }, (_, index) => `${tab}-${index}`));
        const pass = [...finished.values()].every(item => item.ok) && state.count === 200 && state.events.length === 200 && new Set(state.events).size === 200 && expected.every(id => state.events.includes(id));
        report = { syntheticOnly: true, runId, mode, utc: new Date().toISOString(), userAgent: navigator.userAgent, pass, finalCount: state.count, distinctEvents: new Set(state.events).size, tabs: [...finished.values()], limitations: ['Not a full authenticated application test', 'Does not cover old WebLocks-only writers, blocked storage, quotas, or browser crash durability'] };
        write(report); save.disabled = false;
      } else write({ status: 'one-tab-finished', tabs: [...finished.values()] });
    }
  };
  const links = document.querySelector('#links'); links.replaceChildren();
  for (const tab of ['A', 'B']) {
    const a = document.createElement('a'); a.href = `worker.html?run=${runId}&tab=${tab}&locks=${mode === 'mixed' && tab === 'A' ? 'yes' : 'no'}`;
    a.target = '_blank'; a.rel = 'noopener'; a.textContent = `검사 탭 ${tab} 열기`; links.append(a);
  }
  write({ status: 'open-both-test-tabs', runId, mode });
};
start.onclick = () => { start.disabled = true; channel.postMessage({ type: 'start', runId }); write({ status: 'running', runId, mode }); };
save.onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `synthetic-storage-${runId}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
