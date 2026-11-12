/** Executable wrapper factories; importing these does not register or start a server. */
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {isZephyrSupabaseOrigin,hasZephyrIssuer} from './zephyr-28-host.ts';
import {createZephyrOnceHttpHandler} from './zephyr-28-once.ts';
import {createZephyrServerDependencies,createZephyrReservationBridge,hasEmptyTrialBody} from './zephyr-28-adapters.ts';
export const ZEPHYR_PREVIEW_ORIGIN = 'https://yeoni-ai-git-agent-fitness-record-priority-jace3695s-projects.vercel.app';
export const ZEPHYR_PREVIEW_BRANCH = 'agent/fitness-record-priority';
type Env = Record<string,string|undefined>;

export function createZephyrNextWrapper(readEnv: () => Env, serverClient: () => Promise<SupabaseClient>, transport: typeof fetch = fetch) {
  return async (request: Request) => {
    const env = readEnv();
    if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== ZEPHYR_PREVIEW_BRANCH
      || env.YEONI_ZEPHYR_28_ONCE_ENABLED !== '1' || env.YEONI_ZEPHYR_28_TRUSTED_ORIGIN !== ZEPHYR_PREVIEW_ORIGIN) {
      return Response.json({code:'NOT_INSTALLED'},{status:404,headers:{'Cache-Control':'no-store'}});
    }
    const handler = createZephyrOnceHttpHandler({installed:true,environment:env.VERCEL_ENV,branch:env.VERCEL_GIT_COMMIT_REF,
      dependenciesFor: async req => {
        // Reject foreign origin before constructing the existing auth client.
        if (!isZephyrSupabaseOrigin(env.NEXT_PUBLIC_SUPABASE_URL) || !hasZephyrIssuer(req.headers.get('authorization'))
          || new URL(req.url).origin !== ZEPHYR_PREVIEW_ORIGIN || req.headers.get('origin') !== ZEPHYR_PREVIEW_ORIGIN
          || !req.headers.get('authorization')?.startsWith('Bearer ') || req.signal.aborted) throw Error('BLOCKED');
        return createZephyrServerDependencies(req,await serverClient(),{
          trustedOrigin:ZEPHYR_PREVIEW_ORIGIN,supabaseUrl:env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        },transport,() => readEnv().GOOGLE_TTS_API_KEY?.trim());
      }});
    return handler(request);
  };
}

/** Dedicated Edge enable flag required. Same existing key names/custody, no Google key read. */
export function createZephyrEdgeWrapper(readEnv: () => Env, transport: typeof fetch = fetch) {
  return async (request: Request) => {
    const env=readEnv();
    if (env.YEONI_ZEPHYR_28_EDGE_ENABLED !== '1') return Response.json({code:'NOT_INSTALLED'},{status:404,headers:{'Cache-Control':'no-store'}});
    try {
      const url=new URL(env.SUPABASE_URL ?? '');
      if (!isZephyrSupabaseOrigin(env.SUPABASE_URL) || !hasZephyrIssuer(request.headers.get('authorization'))) throw Error('BLOCKED');
      if (!env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('BLOCKED');
      const client=(key:string,authorization?:string)=>createClient(url.origin,key,{
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
        global:{fetch:transport,headers:authorization?{Authorization:authorization}:{}},
      });
      return await createZephyrReservationBridge({caller:authorization=>client(env.SUPABASE_ANON_KEY!,authorization),
        admin:()=>client(env.SUPABASE_SERVICE_ROLE_KEY!)},true)(request);
    } catch {return Response.json({code:'UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});}
  };
}

/** Authentication-only POST with no body. Never reads a grant, reserves or calls Edge/Google. */
export function createZephyrPreflightWrapper(readEnv: () => Env, serverClient: () => Promise<SupabaseClient>) {
  return async (request: Request) => {
    const reply=(hostMatches:boolean,authenticated:boolean,status:number)=>Response.json({hostMatches,authenticated},{status,headers:{'Cache-Control':'private, no-store'}});
    const env=readEnv();
    if(env.VERCEL_ENV!=='preview' || env.VERCEL_GIT_COMMIT_REF!==ZEPHYR_PREVIEW_BRANCH || env.YEONI_ZEPHYR_28_ONCE_ENABLED!=='1'
      || env.YEONI_ZEPHYR_28_TRUSTED_ORIGIN!==ZEPHYR_PREVIEW_ORIGIN) return reply(false,false,404);
    try {
      if(request.method!=='POST' || request.signal.aborted
        || !isZephyrSupabaseOrigin(env.NEXT_PUBLIC_SUPABASE_URL) || new URL(request.url).origin!==ZEPHYR_PREVIEW_ORIGIN
        || request.headers.get('origin')!==ZEPHYR_PREVIEW_ORIGIN || !hasZephyrIssuer(request.headers.get('authorization'))) return reply(false,false,403);
      if (!(await hasEmptyTrialBody(request))) return reply(false,false,403);
      const client=await serverClient();
      if(request.signal.aborted) return reply(false,false,403);
      const {data,error}=await client.auth.getUser(request.headers.get('authorization')!.slice(7));
      if(error || !data.user || request.signal.aborted) return reply(false,false,401);
      return reply(true,true,200);
    } catch {return reply(false,false,401);}
  };
}
