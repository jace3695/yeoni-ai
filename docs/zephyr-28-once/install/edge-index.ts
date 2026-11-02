/** UNREGISTERED entrypoint. Imports no Next auth or Google credentials. No Deno.serve on import. */
import {createZephyrEdgeWrapper} from '../../../lib/zephyr-28-wrappers.ts';
export type EdgeRuntime = { env: {get(name:string):string|undefined}; serve(handler:(request:Request)=>Promise<Response>):unknown };
export function startZephyrEdge(runtime: EdgeRuntime) {
  // This explicit function must be called by the approved deployment entry only.
  const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','YEONI_ZEPHYR_28_EDGE_ENABLED'] as const;
  return runtime.serve(createZephyrEdgeWrapper(() => Object.fromEntries(names.map(name=>[name,runtime.env.get(name)]))));
}
