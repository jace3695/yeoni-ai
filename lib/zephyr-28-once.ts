/** Unwired server-side prototype. No route, credential access or default transport. */
export const ZEPHYR_ONCE = Object.freeze({
  approvalId: 'yeoni-zephyr-28-20261102',
  requestId: 'bba03bc1-0ca2-46a5-8635-55ed913bd424',
  text: '안녕하세요. 연이예요. 오늘도 차근차근 함께할게요.',
  characters: 28,
  voice: 'ko-KR-Chirp3-HD-Zephyr',
  language: 'ko-KR',
  encoding: 'MP3',
  endpoint: 'https://texttospeech.googleapis.com/v1/text:synthesize',
  maximumUsd: 0.01,
} as const);
export type OncePermit = Readonly<{ ownerId: string; approvalId: string; requestId: string;
  expiresAt: number; executionApproved: boolean; allInCapVerified: boolean; costEvidenceId: string }>;
export type OnceGrant = Readonly<{ allowed: boolean; approvalId: string; requestId: string; ownerId: string;
  characters: number; reservedAt: number; sendBefore: number }>;
export type FixedDispatch = Readonly<{ url: typeof ZEPHYR_ONCE.endpoint; method: 'POST'; redirect: 'error';
  cache: 'no-store'; signal: AbortSignal; body: string }>;
export type OnceDependencies = {
  /** Must validate session server-side. Never accept client owner/cost/approval claims. */
  authenticate(): Promise<string | null>;
  preflight(): Promise<OncePermit | null>;
  /** Must commit the atomic reservation before resolving; uncertain outcomes never dispatch. */
  reserve(ownerId: string, approvalId: string, requestId: string): Promise<OnceGrant>;
  /** Future adapter must use existing server-held key in place, never return/log it. */
  dispatch(request: FixedDispatch): Promise<{ ok: boolean; audioContent?: string }>;
  now(): number;
};
export type OnceResult = { code: 'BLOCKED' | 'CONSUMED_OR_UNKNOWN' | 'AUDIO_READY'; audioContent?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function createZephyrOnceRunner(deps: OnceDependencies) {
  // Defense in depth only; durable database reservation is mandatory across workers.
  let attempted = false;
  return async (input: unknown): Promise<OnceResult> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== 1 || (input as {requestId?: unknown}).requestId !== ZEPHYR_ONCE.requestId
      || Array.from(ZEPHYR_ONCE.text).length !== ZEPHYR_ONCE.characters || attempted) return {code:'BLOCKED'};
    try {
      const owner = await deps.authenticate(), permit = await deps.preflight(), now = deps.now();
      if (!owner || !uuid.test(owner) || !permit || permit.ownerId !== owner
        || permit.approvalId !== ZEPHYR_ONCE.approvalId || permit.requestId !== ZEPHYR_ONCE.requestId
        || permit.executionApproved !== true || permit.allInCapVerified !== true || !permit.costEvidenceId.trim()
        || !Number.isFinite(now) || !Number.isFinite(permit.expiresAt) || permit.expiresAt <= now
        || permit.expiresAt > now + 15 * 60_000 || attempted) return {code:'BLOCKED'};
      attempted = true;
      const grant = await deps.reserve(owner, ZEPHYR_ONCE.approvalId, ZEPHYR_ONCE.requestId);
      const dispatchAt = deps.now();
      if (grant.allowed !== true || grant.ownerId !== owner || grant.approvalId !== ZEPHYR_ONCE.approvalId
        || grant.requestId !== ZEPHYR_ONCE.requestId || grant.characters !== 28
        || !Number.isFinite(grant.reservedAt) || !Number.isFinite(grant.sendBefore) || !Number.isFinite(dispatchAt)
        || grant.reservedAt > dispatchAt || dispatchAt - grant.reservedAt > 10_000
        || grant.sendBefore <= dispatchAt || grant.sendBefore > grant.reservedAt + 10_000
        || grant.sendBefore > permit.expiresAt || permit.expiresAt <= dispatchAt) return {code:'CONSUMED_OR_UNKNOWN'};
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10_000); });
        const result = await Promise.race([deps.dispatch(Object.freeze({url:ZEPHYR_ONCE.endpoint,method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,
          body:JSON.stringify({input:{text:ZEPHYR_ONCE.text},voice:{languageCode:ZEPHYR_ONCE.language,name:ZEPHYR_ONCE.voice},audioConfig:{audioEncoding:ZEPHYR_ONCE.encoding}})})), timeout]);
        if (!result.ok || typeof result.audioContent !== 'string' || !result.audioContent.length
          || result.audioContent.length > 2_000_000 || result.audioContent.length % 4 !== 0
          || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audioContent)) return {code:'CONSUMED_OR_UNKNOWN'};
        return {code:'AUDIO_READY',audioContent:result.audioContent};
      } finally { if (timer) clearTimeout(timer); }
    } catch { return {code:attempted ? 'CONSUMED_OR_UNKNOWN' : 'BLOCKED'}; }
  };
}

/** Proposed HTTP boundary, deliberately not registered in app/api. */
export function createZephyrOnceHttpHandler(options: {
  installed: boolean; environment: string; branch: string;
  dependenciesFor(request: Request): OnceDependencies;
}) {
  return async (request: Request) => {
    const reply = (body: object, status: number) => Response.json(body, {status,headers:{'Cache-Control':'private, no-store'}});
    if (!options.installed || options.environment !== 'preview' || options.branch !== 'agent/fitness-record-priority') return reply({code:'NOT_INSTALLED'},404);
    if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return reply({code:'INVALID_REQUEST'},400);
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply({code:'INVALID_REQUEST'},400);
      const chunks: Uint8Array[] = []; let length=0;
      try {
        while (true) { const next=await reader.read();if(next.done)break;length+=next.value.length;
          if(length>256){await reader.cancel();return reply({code:'INVALID_REQUEST'},400);}chunks.push(next.value); }
      } finally {reader.releaseLock();}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const body:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const result=await createZephyrOnceRunner(options.dependenciesFor(request))(body);
      return reply(result,result.code==='AUDIO_READY'?200:result.code==='BLOCKED'?403:409);
    } catch {return reply({code:'BLOCKED'},403);}
  };
}
