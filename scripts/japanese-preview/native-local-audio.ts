import type { LocalSpeechPort, ProbeUtterance } from './local-audio-probe';

/** The only QA file permitted to touch native synthesis. Never used by lessons. */
export function browserLocalSpeechPort(): LocalSpeechPort | null {
  if (typeof window === 'undefined' || window.origin !== 'null') return null;
  try {
    const engine = window.speechSynthesis;
    if (!engine || typeof SpeechSynthesisUtterance !== 'function') return null;
    return {
      getVoices: () => engine.getVoices(),
      createUtterance: text => new SpeechSynthesisUtterance(text) as unknown as ProbeUtterance,
      speak: utterance => engine.speak(utterance as unknown as SpeechSynthesisUtterance),
      cancel: () => engine.cancel(),
      state: () => ({ speaking: engine.speaking, pending: engine.pending, paused: engine.paused }),
      userActivation: () => navigator.userActivation?.isActive === true,
      onVoicesChanged: listener => {
        engine.addEventListener('voiceschanged', listener);
        return () => engine.removeEventListener('voiceschanged', listener);
      },
    };
  } catch { return null; }
}
