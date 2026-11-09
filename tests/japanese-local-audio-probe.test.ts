import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocalJapaneseAudioProbe, isStrictLocalJapaneseVoice, strictLocalJapaneseVoices, LOCAL_JAPANESE_SAMPLES } from '../scripts/japanese-preview/local-audio-probe.ts';
import type { ProbeVoice, ProbeUtterance, LocalSpeechPort, LocalAudioReport } from '../scripts/japanese-preview/local-audio-probe.ts';

const local = (overrides: Partial<ProbeVoice> = {}): ProbeVoice => ({ name: 'Synthetic local Japanese', voiceURI: 'urn:synthetic:ja', lang: 'ja-JP', localService: true, default: false, ...overrides });
function fakePort(initialVoices = [local()]) {
  let voices = initialVoices;
  let active = true;
  let status = { speaking: false, pending: false, paused: false };
  const submitted: ProbeUtterance[] = [];
  const listeners = new Set<() => void>();
  let cancels = 0;
  const port: LocalSpeechPort = {
    getVoices: () => voices,
    createUtterance: text => ({ text, lang: '', voice: null, rate: 0, pitch: 0, volume: 0, onstart: null, onend: null, onerror: null }),
    speak: utterance => { submitted.push(utterance); status = { speaking: false, pending: true, paused: false }; },
    cancel: () => { cancels++; status = { speaking: false, pending: false, paused: false }; },
    state: () => ({ ...status }),
    userActivation: () => active,
    onVoicesChanged: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  return { port, submitted, listeners, get cancels() { return cancels; },
    setVoices(next: ProbeVoice[]) { voices = next; },
    voicesChanged() { for (const listener of [...listeners]) listener(); },
    activation(value: boolean) { active = value; },
    state(value: Partial<typeof status>) { status = { ...status, ...value }; },
    start() { status = { speaking: true, pending: false, paused: false }; submitted.at(-1)?.onstart?.(); },
    end() { status = { speaking: false, pending: false, paused: false }; submitted.at(-1)?.onend?.(); },
  };
}
function key(port: LocalSpeechPort) { return strictLocalJapaneseVoices(port.getVoices())[0]?.key ?? ''; }

test('only explicitly local Japanese voices with a usable identity qualify', () => {
  assert.equal(isStrictLocalJapaneseVoice(local()), true);
  assert.equal(isStrictLocalJapaneseVoice(local({ lang: 'ja' })), true);
  assert.equal(isStrictLocalJapaneseVoice(local({ default: true })), true);
  for (const voice of [local({ localService: false }), local({ localService: undefined as unknown as boolean }),
    local({ localService: 'true' as unknown as boolean }), local({ default: undefined as unknown as boolean }),
    local({ lang: 'en-US' }), local({ lang: 'japanese' }), local({ lang: 'ja_JP' }), local({ lang: 'ja-JP\n' }),
    local({ lang: '' }), local({ name: '' }), local({ voiceURI: '' })]) assert.equal(isStrictLocalJapaneseVoice(voice), false, JSON.stringify(voice));
});

test('ambiguous voice identities are omitted even when only one duplicate reports local', () => {
  assert.equal(strictLocalJapaneseVoices([local(), local()]).length, 0);
  assert.equal(strictLocalJapaneseVoices([local(), local({ localService: false })]).length, 0);
  assert.equal(strictLocalJapaneseVoices([local(), local({ voiceURI: 'urn:second' })]).length, 2);
});

test('API absence, empty list and remote-only lists fail closed without synthesis', async () => {
  assert.equal(createLocalJapaneseAudioProbe(null).inspect().available, false);
  for (const voices of [[], [local({ localService: false })]]) {
    const fake = fakePort(voices); const probe = createLocalJapaneseAudioProbe(fake.port);
    assert.deepEqual(probe.inspect().voices, []);
    const result = await probe.run('greeting', 'unknown');
    assert.equal(result.state, 'blocked'); assert.equal(result.requestedCount, 0);
    assert.equal(fake.submitted.length, 0); assert.equal(fake.cancels, 0);
  }
});

test('a local Japanese default voice requires explicit selection and is fixed on the utterance', async () => {
  const fake = fakePort([local({ default: true })]); const probe = createLocalJapaneseAudioProbe(fake.port);
  assert.equal(probe.inspect().voices.length, 1);
  assert.equal((await probe.run('greeting', '')).state, 'blocked');
  assert.equal(fake.submitted.length, 0);
  const promise = probe.run('greeting', key(fake.port));
  assert.equal(fake.submitted[0].voice, fake.port.getVoices()[0]);
  fake.start(); fake.end(); const report = await promise;
  assert.equal(report.state, 'ended'); assert.equal(report.voice?.default, true);
  assert.equal(report.voice?.localService, true); assert.equal(fake.submitted.length, 1);
});

test('inspecting voices is read-only and does not choose a voice or play audio', () => {
  const fake = fakePort(); const inventory = createLocalJapaneseAudioProbe(fake.port).inspect();
  assert.equal(inventory.voices.length, 1); assert.equal(fake.submitted.length, 0); assert.equal(fake.cancels, 0);
});

test('arbitrary text/sample IDs cannot enter the synthesis backend', async () => {
  const fake = fakePort(); const probe = createLocalJapaneseAudioProbe(fake.port);
  const result = await probe.run('Private user content', key(fake.port));
  assert.equal(result.state, 'blocked'); assert.equal(result.text, ''); assert.equal(fake.submitted.length, 0);
  assert.equal(LOCAL_JAPANESE_SAMPLES.length, 3);
});

test('lack of an active user gesture blocks synthesis', async () => {
  const fake = fakePort(); fake.activation(false);
  assert.equal((await createLocalJapaneseAudioProbe(fake.port).run('greeting', key(fake.port))).state, 'blocked');
  assert.equal(fake.submitted.length, 0);
});

test('a stale or now-remote voice is revalidated before speaking with no default fallback', async () => {
  const fake = fakePort(); const selected = key(fake.port); fake.setVoices([local({ localService: false })]);
  const report = await createLocalJapaneseAudioProbe(fake.port).run('greeting', selected);
  assert.equal(report.state, 'blocked'); assert.equal(fake.submitted.length, 0);
});

test('an existing speaking/pending/paused engine is never cancelled or reused', async () => {
  for (const flag of ['speaking', 'pending', 'paused'] as const) {
    const fake = fakePort(); fake.state({ [flag]: true });
    assert.equal((await createLocalJapaneseAudioProbe(fake.port).run('greeting', key(fake.port))).state, 'blocked');
    assert.equal(fake.submitted.length, 0); assert.equal(fake.cancels, 0);
  }
});

test('a single allowed sample fixes the exact voice and reports events, never audible success', async () => {
  const fake = fakePort(); const changes: LocalAudioReport[] = [];
  const promise = createLocalJapaneseAudioProbe(fake.port).run('greeting', key(fake.port), { onUpdate: report => changes.push(report) });
  assert.equal(fake.submitted.length, 1);
  const utterance = fake.submitted[0];
  assert.equal(utterance.voice, fake.port.getVoices()[0]); assert.equal(utterance.lang, 'ja-JP');
  assert.equal(utterance.text, LOCAL_JAPANESE_SAMPLES[0].text);
  assert.equal(utterance.rate, 1); assert.equal(utterance.volume, 1);
  fake.start(); fake.end(); const report = await promise;
  assert.equal(report.state, 'ended'); assert.equal(report.startObserved, true); assert.equal(report.endObserved, true);
  assert.equal(report.requestedCount, 1); assert.equal(report.actualListening, 'not-verified');
  assert.ok(changes.every(item => item.actualListening === 'not-verified'));
  assert.ok(changes.some(item => item.engine?.speaking));
  assert.deepEqual(report.engine, { speaking: false, pending: false, paused: false });
  assert.equal(fake.listeners.size, 0); assert.equal(utterance.onstart, null); assert.equal(fake.cancels, 0);
});

test('end without start is not treated as successful synthesis', async () => {
  const fake = fakePort(); const promise = createLocalJapaneseAudioProbe(fake.port).run('daily', key(fake.port));
  fake.end(); const report = await promise;
  assert.equal(report.state, 'error'); assert.equal(report.startObserved, false); assert.equal(report.endObserved, true);
});

test('all engine errors stop without native retry or server fallback', async () => {
  for (const error of ['not-allowed', 'network', 'voice-unavailable', 'audio-hardware', 'synthesis-unavailable']) {
    const fake = fakePort(); const promise = createLocalJapaneseAudioProbe(fake.port).run('reading', key(fake.port));
    fake.submitted[0].onerror?.({ error }); const report = await promise;
    assert.equal(report.state, 'error'); assert.equal(report.actualListening, 'not-verified');
    assert.equal(fake.submitted.length, 1); assert.equal(fake.cancels, 1); assert.equal(fake.listeners.size, 0);
  }
});

test('timeout cancels only the probe and never claims success', async () => {
  const fake = fakePort(); const report = await createLocalJapaneseAudioProbe(fake.port, 5).run('greeting', key(fake.port));
  assert.equal(report.state, 'timed-out'); assert.equal(fake.cancels, 1); assert.equal(fake.submitted.length, 1);
});

test('an already aborted signal makes no native synthesis or cancellation call', async () => {
  const fake = fakePort(); const controller = new AbortController(); controller.abort();
  const report = await createLocalJapaneseAudioProbe(fake.port).run('greeting', key(fake.port), { signal: controller.signal });
  assert.equal(report.state, 'cancelled'); assert.equal(report.requestedCount, 0);
  assert.equal(fake.submitted.length, 0); assert.equal(fake.cancels, 0);
});

test('abort cancels once and late captured events cannot rewrite the resolved result', async () => {
  const fake = fakePort(); const controller = new AbortController();
  const promise = createLocalJapaneseAudioProbe(fake.port).run('greeting', key(fake.port), { signal: controller.signal });
  const oldEnd = fake.submitted[0].onend; controller.abort(); const report = await promise; oldEnd?.();
  assert.equal(report.state, 'cancelled'); assert.equal(report.endObserved, false); assert.equal(fake.cancels, 1);
});

test('double clicks cannot queue another utterance', async () => {
  const fake = fakePort(); const probe = createLocalJapaneseAudioProbe(fake.port);
  const first = probe.run('greeting', key(fake.port)); const second = await probe.run('daily', key(fake.port));
  assert.equal(second.state, 'blocked'); assert.equal(second.requestedCount, 0); assert.equal(fake.submitted.length, 1);
  probe.cancel(); assert.equal((await first).state, 'cancelled');
});

test('a voice changing to remote while queued or speaking cancels without fallback', async () => {
  const fake = fakePort(); const probe = createLocalJapaneseAudioProbe(fake.port);
  const promise = probe.run('greeting', key(fake.port)); fake.start();
  fake.setVoices([local({ localService: false })]); fake.voicesChanged();
  assert.equal((await promise).state, 'error'); assert.equal(fake.cancels, 1); assert.equal(fake.submitted.length, 1);
});

test('dispose cancels the active operation and prevents future use', async () => {
  const fake = fakePort(); const probe = createLocalJapaneseAudioProbe(fake.port);
  const promise = probe.run('greeting', key(fake.port)); probe.dispose();
  assert.equal((await promise).state, 'cancelled'); assert.equal(probe.inspect().available, false);
  assert.equal((await probe.run('daily', key(fake.port))).state, 'blocked'); assert.equal(fake.submitted.length, 1);
});

test('a throwing observer cannot suppress cancellation or corrupt the report', async () => {
  const fake = fakePort(); const probe = createLocalJapaneseAudioProbe(fake.port);
  const promise = probe.run('greeting', key(fake.port), { onUpdate: () => { throw new Error('observer'); } });
  fake.start(); fake.end(); assert.equal((await promise).state, 'ended');
});

test('cancel from an early status observer never sends audio and records zero submissions', async () => {
  const fake = fakePort(); const probe = createLocalJapaneseAudioProbe(fake.port);
  const result = await probe.run('greeting', key(fake.port), { onUpdate: report => { if (report.state === 'queued') probe.cancel(); } });
  assert.equal(result.state, 'cancelled'); assert.equal(result.requestedCount, 0); assert.equal(fake.submitted.length, 0); assert.equal(fake.cancels, 0);
});

test('native bridge is opaque-origin-only and source contains no network/recording/storage APIs', async () => {
  const native = await readFile(new URL('../scripts/japanese-preview/native-local-audio.ts', import.meta.url), 'utf8');
  const core = await readFile(new URL('../scripts/japanese-preview/local-audio-probe.ts', import.meta.url), 'utf8');
  const component = await readFile(new URL('../scripts/japanese-preview/LocalAudioProbe.tsx', import.meta.url), 'utf8');
  assert.match(native, /window\.origin !== 'null'/);
  assert.equal((native.match(/window\.speechSynthesis/g) ?? []).length, 1);
  assert.match(native, /navigator\.userActivation\?\.isActive === true/);
  assert.doesNotMatch(core + component, /\bspeechSynthesis\b|\bSpeechSynthesisUtterance\b/);
  assert.doesNotMatch(native + core + component, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|MediaRecorder|getUserMedia|SpeechRecognition|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
  assert.match(component, /실제 청취: 미검증/);
  assert.match(component, /window\.addEventListener\('hashchange', cancel\)/);
});
