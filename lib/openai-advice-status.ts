/** Public, fixed capability status only. Never accepts a question, identity or approval. */
export const OPENAI_ADVICE_STATUS = Object.freeze({ available: false, code: 'OPENAI_ADVICE_NOT_CONNECTED' } as const);
export type OpenAiStatusResult = 'not-connected' | 'unconfirmed';
export async function checkOpenAiAdviceStatus(fetchStatus: typeof fetch, signal: AbortSignal): Promise<OpenAiStatusResult> {
  try {
    const response = await fetchStatus('/api/ai/openai-advice', {
      method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal,
    });
    if (!response.ok || signal.aborted) return 'unconfirmed';
    const body: unknown = await response.json();
    if (signal.aborted || !body || typeof body !== 'object' || Array.isArray(body)) return 'unconfirmed';
    const value = body as Record<string, unknown>;
    return Object.keys(value).length === 2 && value.available === false && value.code === OPENAI_ADVICE_STATUS.code
      ? 'not-connected' : 'unconfirmed';
  } catch { return 'unconfirmed'; }
}
