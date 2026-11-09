import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertPreviewNativeAudioSources, nativeAudioBridgePath } from '../scripts/japanese-preview/build.mjs';

const source = await readFile(new URL('../scripts/japanese-preview/native-local-audio.ts', import.meta.url), 'utf8');
const bridge = { path: nativeAudioBridgePath, source };

test('only the exact reviewed native bridge is permitted', () => {
  assert.doesNotThrow(() => assertPreviewNativeAudioSources([bridge, { path: 'safe.ts', source: 'export const synthetic = true;' }]));
});
test('changed, missing, duplicate or renamed native bridges fail closed', () => {
  for (const entries of [[], [{ ...bridge, source: source + '\n' }], [bridge, bridge], [{ ...bridge, path: 'other.ts' }]]) {
    assert.throws(() => assertPreviewNativeAudioSources(entries), /Native audio bridge changed or missing/);
  }
});
test('other inputs cannot introduce a second native engine or utterance reference', () => {
  for (const token of ['window.speechSynthesis', 'globalThis.speechSynthesis', 'new SpeechSynthesisUtterance("test")']) {
    assert.throws(() => assertPreviewNativeAudioSources([bridge, { path: 'other.ts', source: token }]), /Native audio outside reviewed bridge/);
  }
});
test('the real lesson adapter remains an explicit failure with no native audio', async () => {
  const adapter = await readFile(new URL('../scripts/japanese-preview/audio.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(adapter, /speechSynthesis|SpeechSynthesisUtterance|native-local-audio|local-audio-probe/);
  assert.match(adapter, /throw new Error/);
});
