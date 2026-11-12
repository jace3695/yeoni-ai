/** Narrow one-off trial binding. Decoding a JWT is rejection-only, never authentication. */
export const ZEPHYR_SUPABASE_ORIGIN = 'https://piqqukiiacncfbztktga.supabase.co';
export function isZephyrSupabaseOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() !== value) return false;
  try {
    const url=new URL(value);
    return url.origin===ZEPHYR_SUPABASE_ORIGIN && !url.username && !url.password
      && url.pathname==='/' && !url.search && !url.hash
      && (value===url.origin || value===url.origin+'/');
  } catch {return false;}
}
export function hasZephyrIssuer(authorization: string | null): boolean {
  if (!authorization?.startsWith('Bearer ') || authorization.length>16384) return false;
  const parts=authorization.slice(7).split('.');
  if(parts.length!==3 || parts.some(part=>!part || !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const raw=atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-parts[1].length%4)%4));
    const payload:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0))));
    return !!payload && typeof payload==='object' && !Array.isArray(payload) && 'iss' in payload
      && payload.iss===ZEPHYR_SUPABASE_ORIGIN+'/auth/v1';
  } catch {return false;}
}
