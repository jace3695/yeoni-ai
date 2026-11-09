export function japaneseAudioErrorMessage() {
  return '가상 화면 검사에서는 음성을 재생하거나 전송하지 않아요. 문장 보기로 계속할 수 있어요. 실제 음성 검증은 별도예요.';
}

export async function speakJapaneseWithPreferredTts(_text: string, options: { signal?: AbortSignal; onEnd?: () => void } = {}) {
  if (options.signal?.aborted) return;
  // No fake success/onEnd: listening must use the real component's reading fallback.
  throw new Error(japaneseAudioErrorMessage());
}
