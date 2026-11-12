import { constants } from 'node:os';
import { performance } from 'node:perf_hooks';

// This bounds the runner's wait, not the lifetime of escaped/privileged descendants.
export const terminationGraceMs = 5000;
const maximumDurationMs = 780000;
const reasons = ['none', 'timeout', 'cancelled', 'capture-error', 'runner-error', 'prepare-error', 'finalize-error'];
const attempts = ['not-attempted', 'accepted', 'missing', 'denied', 'other'];
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
const integer = (value, min, max, fallback) => Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
const duration = value => Number.isFinite(value) && value >= 0 ? Math.min(maximumDurationMs, Math.floor(value)) : -1;

// Nothing from error messages, streams, paths, environment or child text enters this schema.
export function lifecycleLine(stage, observation) {
  if (!/^stage-[0-9]{2}$/.test(stage)) throw new Error('Invalid stage');
  const signal = integer(constants.signals[observation.signal], 1, 64, 0);
  return `${stage} lifecycle reason=${choice(observation.reason, reasons, 'runner-error')}`
    + ` code=${integer(observation.code, 0, 255, -1)} signal=${signal}`
    + ` durationMs=${duration(observation.durationMs)} exitMs=${duration(observation.exitMs)} closeMs=${duration(observation.closeMs)}`
    + ` durationCapped=${[observation.durationMs, observation.exitMs, observation.closeMs].some(value => Number.isFinite(value) && value > maximumDurationMs) ? 1 : 0}`
    + ` leader=${observation.exited === true ? 'exited' : 'unobserved'}`
    + ` capture=${choice(observation.capture, ['unverified', 'drained', 'abandoned'], 'unverified')}`
    + ' processCleanup=unverified'
    + ` term=${choice(observation.term, attempts, 'other')} kill=${choice(observation.kill, attempts, 'other')}`;
}

export function runPrivateStage(work, { timeoutMs, signal, cleanup = false }) {
  const started = performance.now();
  const observation = { reason: 'none', code: null, signal: null, exited: false, exitMs: -1, closeMs: -1,
    capture: 'unverified', term: 'not-attempted', kill: 'not-attempted' };
  let child, finished = false, interrupted = false, stageTimer, killTimer, resolveChild;
  let onExit, onClose, onError;
  const elapsed = () => performance.now() - started;
  return new Promise(resolveStage => {
    const signalGroup = kind => {
      if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) return;
      try { process.kill(-child.pid, kind === 'term' ? 'SIGTERM' : 'SIGKILL'); observation[kind] = 'accepted'; }
      catch (error) { observation[kind] = error?.code === 'ESRCH' ? 'missing' : error?.code === 'EPERM' ? 'denied' : 'other'; }
    };
    const release = () => {
      if (!child) return;
      child.removeListener('exit', onExit); child.removeListener('close', onClose);
      // Keep an error sink for a late native event, without retaining runner state.
      child.removeListener('error', onError); child.on('error', () => {});
      if (observation.capture !== 'drained') {
        observation.capture = 'abandoned';
        for (const stream of [child.stdout, child.stderr]) {
          stream?.removeAllListeners('data'); stream?.destroy();
        }
      }
      child.unref();
    };
    const finish = result => {
      if (finished) return;
      finished = true;
      clearTimeout(stageTimer); clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      release(); resolveChild?.(1);
      resolveStage({ ...result, code: interrupted ? 1 : result.code,
        observation: { ...observation, durationMs: elapsed() } });
    };
    const stop = reason => {
      if (finished || interrupted) return;
      interrupted = true; observation.reason = reason;
      signalGroup('term');
      // First stop wins. Further aborts must never renew the grace deadline.
      killTimer = setTimeout(() => {
        signalGroup('kill');
        finish({ code: 1 });
      }, terminationGraceMs);
    };
    const abort = () => { if (!cleanup) stop('cancelled'); };
    const control = {
      get finished() { return finished; },
      get interrupted() { return interrupted; },
      get termination() { return observation.reason; },
      check() { if (finished || interrupted) throw new Error('Stage stopped'); },
      captureError() { stop('capture-error'); },
      fail(reason) { if (observation.reason === 'none') observation.reason = choice(reason, reasons, 'runner-error'); },
      watch(value) {
        child = value;
        return new Promise(resolve => {
          resolveChild = resolve;
          onExit = (code, signalName) => {
            observation.exited = true; observation.code = code; observation.signal = signalName; observation.exitMs = elapsed();
          };
          onClose = code => {
            observation.capture = 'drained'; observation.closeMs = elapsed(); resolve(interrupted ? 1 : code === 0 ? 0 : 1);
          };
          onError = () => { control.fail('runner-error'); resolve(1); };
          child.on('exit', onExit); child.on('close', onClose); child.on('error', onError);
          // A synchronous spawn observer may have delivered abort before registration.
          if (interrupted) signalGroup('term');
          if (finished) { signalGroup('kill'); release(); resolve(1); }
        });
      },
    };
    // Include private preparation and finalization in the existing stage budget.
    stageTimer = setTimeout(() => stop('timeout'), cleanup ? Math.min(timeoutMs, 11 * 60_000) : timeoutMs);
    if (!cleanup) {
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    }
    Promise.resolve().then(() => { control.check(); return work(control); })
      .then(result => finish(result), () => { control.fail(child ? 'finalize-error' : 'prepare-error'); finish({ code: 1 }); });
  });
}
