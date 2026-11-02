/** Server adapter factories only. No route registration, environment reads at import, or startup calls. */
import process from 'node:process';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZEPHYR_ONCE, type OnceDependencies, type OnceGrant, type OncePermit } from './zephyr-28-once.ts';

type Transport = typeof fetch;
const json = (body: unknown, status = 200) => Response.json(body, {status,headers:{'Cache-Control':'private, no-store'}});

/** Bounds bytes while reading, not just after response.json has allocated them. */
export async function readOnceJson(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<unknown> {
  if (!body || signal.aborted) throw Error('UNAVAILABLE');
  const reader = body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, {once:true});
  try {
    for (;;) {
      const next = await reader.read();
      if (signal.aborted) throw Error('UNAVAILABLE');
      if (next.done) break;
      size += next.value.length;
      if (size > limit) { await reader.cancel(); throw Error('UNAVAILABLE'); }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

/** Future Next route supplies its existing server Supabase client. Bearer token is revalidated, never trusted from claims. */
export function createZephyrServerDependencies(request: Request, client: SupabaseClient, config: {
  trustedOrigin: string; supabaseUrl: string;
}, transport: Transport = fetch, readExistingGoogleKey = () => process.env.GOOGLE_TTS_API_KEY?.trim()): OnceDependencies {
  const origin = new URL(config.trustedOrigin), base = new URL(config.supabaseUrl);
  if (origin.protocol !== 'https:' || origin.origin !== config.trustedOrigin || base.protocol !== 'https:'
    || base.username || base.password || base.search || base.hash || (base.pathname !== '/' && base.pathname !== '')
    || request.headers.get('origin') !== config.trustedOrigin || new URL(request.url).origin !== config.trustedOrigin) throw Error('UNAVAILABLE');
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || !authorization.slice(7).trim()) throw Error('UNAVAILABLE');
  let owner: string | null = null;
  const bridge = async (action: 'status' | 'reserve') => {
    if (!owner || request.signal.aborted) throw Error('UNAVAILABLE');
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]);
    const response = await transport(`${base.origin}/functions/v1/zephyr-28-once`, {
      method:'POST', redirect:'error', cache:'no-store', signal,
      headers:{'Content-Type':'application/json',Authorization:authorization},
      body:JSON.stringify({action,requestId:ZEPHYR_ONCE.requestId}),
    });
    if (!response.ok) { await response.body?.cancel(); throw Error('UNAVAILABLE'); }
    return readOnceJson(response.body, 4096, signal);
  };
  return {
    authenticate: async () => {
      if (request.signal.aborted) return null;
      const {data,error} = await client.auth.getUser(authorization.slice(7));
      owner = !error && !request.signal.aborted ? data.user?.id ?? null : null;
      return owner;
    },
    preflight: async () => await bridge('status') as OncePermit,
    reserve: async (user,approval,id) => {
      if (user !== owner || approval !== ZEPHYR_ONCE.approvalId || id !== ZEPHYR_ONCE.requestId) throw Error('UNAVAILABLE');
      return await bridge('reserve') as OnceGrant;
    },
    dispatch: async fixed => {
      // Do not trust runtime callers merely because the TypeScript argument is literal-typed.
      const expected = JSON.stringify({input:{text:ZEPHYR_ONCE.text},voice:{languageCode:ZEPHYR_ONCE.language,name:ZEPHYR_ONCE.voice},audioConfig:{audioEncoding:'MP3'}});
      if (!owner || request.signal.aborted || fixed.signal.aborted || fixed.url !== ZEPHYR_ONCE.endpoint
        || fixed.method !== 'POST' || fixed.redirect !== 'error' || fixed.body !== expected) throw Error('UNAVAILABLE');
      const key = readExistingGoogleKey(); // Existing server custody only; never passed to Edge or returned/logged.
      if (!key) throw Error('UNAVAILABLE');
      const signal = AbortSignal.any([request.signal,fixed.signal]);
      const response = await transport(ZEPHYR_ONCE.endpoint, {method:'POST',redirect:'error',cache:'no-store',signal,
        headers:{'Content-Type':'application/json','x-goog-api-key':key},body:expected});
      if (!response.ok) { await response.body?.cancel(); return {ok:false}; }
      const result = await readOnceJson(response.body, 2_001_024, signal);
      if (!result || typeof result !== 'object' || !('audioContent' in result) || typeof result.audioContent !== 'string') return {ok:false};
      return {ok:true,audioContent:result.audioContent};
    },
    now: Date.now,
  };
}

/** Future Edge wrapper provides existing anon/auth and service-role clients; no Google key is present here. */
export function createZephyrReservationBridge(clients: {
  caller(authorization: string): SupabaseClient;
  admin(): SupabaseClient;
}, installed = false) {
  return async (request: Request) => {
    if (!installed) return json({code:'NOT_INSTALLED'},404);
    try {
      if (request.method !== 'POST' || request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({code:'BLOCKED'},400);
      const authorization = request.headers.get('authorization') ?? '';
      if (!authorization.startsWith('Bearer ') || request.signal.aborted) return json({code:'BLOCKED'},401);
      const {data,error} = await clients.caller(authorization).auth.getUser(authorization.slice(7));
      if (error || !data.user || request.signal.aborted) return json({code:'BLOCKED'},401);
      const body = await readOnceJson(request.body,256,AbortSignal.any([request.signal,AbortSignal.timeout(8_000)]));
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
        || !('requestId' in body) || body.requestId !== ZEPHYR_ONCE.requestId || !('action' in body)
        || !['status','reserve'].includes(String(body.action))) return json({code:'BLOCKED'},400);
      const admin = clients.admin();
      if (request.signal.aborted) return json({code:'BLOCKED'},409);
      if (body.action === 'status') {
        const {data:row,error:readError} = await admin.from('zephyr_28_once')
          .select('owner_id,approval_id,request_id,expires_at,execution_approved,cost_evidence,reserved_at')
          .eq('owner_id',data.user.id).eq('approval_id',ZEPHYR_ONCE.approvalId).eq('request_id',ZEPHYR_ONCE.requestId).maybeSingle();
        if (readError || !row || row.reserved_at !== null || request.signal.aborted) return json(null,403);
        return json({ownerId:row.owner_id,approvalId:row.approval_id,requestId:row.request_id,expiresAt:Date.parse(row.expires_at),
          executionApproved:row.execution_approved,costEvidence:row.cost_evidence});
      }
      // Do not cancel or retry a write with an uncertain commit. Its immutable row is authoritative.
      const {data:grant,error:reserveError} = await admin.rpc('reserve_zephyr_28_once', {
        p_owner:data.user.id,p_approval:ZEPHYR_ONCE.approvalId,p_request:ZEPHYR_ONCE.requestId,
      });
      if (reserveError || !grant || request.signal.aborted) return json({code:'CONSUMED_OR_UNKNOWN'},409);
      return json(grant);
    } catch { return json({code:'UNAVAILABLE'},503); }
  };
}
