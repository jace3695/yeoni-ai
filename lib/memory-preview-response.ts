import { createHash } from 'node:crypto';

export const MEMORY_PREVIEW_PATH = '/api/qa/memory';
export const MEMORY_PREVIEW_BRANCH = 'agent/fitness-record-priority';
export type MemoryPreviewPayload = { version: 1; script: string; styles: string; sourceDigest: string };

/** No URL, cookie, browser storage, request header or client flag grants access.
 * Vercel's existing deployment protection remains in front of this route. */
export function memoryPreviewEnabled(env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string }) {
  return env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === MEMORY_PREVIEW_BRANCH;
}

const commonHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Frame-Options': 'DENY',
};

export async function memoryPreviewResponse(
  env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string },
  readPayload: () => Promise<unknown>,
): Promise<Response> {
  if (!memoryPreviewEnabled(env)) return new Response('Not found', { status: 404, headers: commonHeaders });
  try {
    const value = await readPayload();
    if (!value || typeof value !== 'object') throw new Error('Missing fixture');
    const payload = value as MemoryPreviewPayload;
    if (payload.version !== 1 || typeof payload.script !== 'string' || typeof payload.styles !== 'string'
      || !/^[a-f0-9]{64}$/.test(payload.sourceDigest) || payload.script.length > 4_000_000 || payload.styles.length > 500_000
      || !payload.script.length || /<\/script/i.test(payload.script) || /<\/style/i.test(payload.styles)) throw new Error('Invalid fixture');
    const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
    const policy = [
      "default-src 'none'", `script-src ${hash(payload.script)}`, `style-src ${hash(payload.styles)}`,
      "connect-src 'none'", "img-src 'none'", "font-src 'none'", "media-src 'none'", "worker-src 'none'",
      "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
      // Opaque origin: no real cookies, Web Storage, IndexedDB or service worker.
      // Scripts use an injected in-memory store/IDB simulator, never native storage.
      'sandbox allow-scripts',
    ].join('; ');
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>연이 기억 관리 · 가상 화면 검사</title><style>${payload.styles}</style></head><body><div id="root"><p>격리된 기억 관리 검사 화면을 준비하고 있어요.</p></div><noscript>이 화면은 JavaScript가 필요해요. 실제 계정 화면으로 이동하지 않습니다.</noscript><script>${payload.script}</script></body></html>`;
    return new Response(html, { headers: {
      ...commonHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': policy,
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'X-Yeoni-QA-Source': payload.sourceDigest,
    } });
  } catch {
    // Never redirect or fall back to a layout that can mount personal sync.
    return new Response('Synthetic memory screen unavailable', { status: 503, headers: commonHeaders });
  }
}
