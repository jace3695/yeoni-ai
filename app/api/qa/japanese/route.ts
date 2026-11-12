import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { japanesePreviewResponse } from '@/lib/japanese-preview-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Route Handlers do not render the root/language layouts. The existing worker
// excludes every /api/ request, including navigation and offline fallbacks.
export async function GET() {
  return japanesePreviewResponse({ VERCEL_ENV: process.env.VERCEL_ENV, VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF }, async () => JSON.parse(await readFile(
    join(process.cwd(), '.generated/japanese-preview/payload.json'), 'utf8',
  )));
}
