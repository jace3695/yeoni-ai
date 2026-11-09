import { withLanguageRecordLock } from './languageStorageLock.js';
const output = document.querySelector('#status');
if (!['localhost', '127.0.0.1'].includes(location.hostname) || location.port !== '41871') throw new Error('Synthetic harness origin required.');
const params = new URLSearchParams(location.search), runId = params.get('run'), tab = params.get('tab'), wantsLocks = params.get('locks') === 'yes';
if (!/^[a-f0-9-]{36}$/.test(runId ?? '') || !['A', 'B'].includes(tab)) throw new Error('Synthetic run parameters required.');
if (!wantsLocks) Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
const nativeLocks = typeof navigator.locks?.request === 'function';
const channel = new BroadcastChannel(`yeoni-compat-synthetic:${runId}`), key = `yeoni-compat-synthetic:${runId}`;
let running = false;
channel.onmessage = async ({ data }) => {
  if (running || data?.type !== 'start' || data.runId !== runId) return;
  running = true; let completed = 0;
  output.textContent = '가상 저장 검사 중';
  try {
    if (wantsLocks && !nativeLocks) throw new Error('Mixed mode requested but this browser has no Web Locks; use IDB-only mode.');
    for (let index = 0; index < 100; index++) {
      await withLanguageRecordLock(() => {
        const state = JSON.parse(localStorage.getItem(key));
        if (!state || !Number.isInteger(state.count) || !Array.isArray(state.events)) throw new Error('Invalid synthetic fixture');
        // Deliberate short synchronous contention; never await inside the gate.
        const until = performance.now() + 2;
        while (performance.now() < until) { /* synthetic contention */ }
        localStorage.setItem(key, JSON.stringify({ count: state.count + 1, events: [...state.events, `${tab}-${index}`] }));
      });
      completed++;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    output.textContent = `${tab}: 가상 답 ${completed}개 저장 확인`;
    channel.postMessage({ type: 'done', runId, tab, ok: true, completed, webLocks: nativeLocks });
  } catch (error) {
    output.textContent = `${tab}: ${String(error)}`;
    channel.postMessage({ type: 'done', runId, tab, ok: false, completed, webLocks: nativeLocks, error: String(error) });
  }
};
channel.postMessage({ type: 'ready', runId, tab });
output.textContent = `${tab}: 준비 완료, Web Locks ${nativeLocks ? '사용' : '미사용'}, IndexedDB 공통 저장 순서 사용. 검사 시작을 기다립니다.`;
