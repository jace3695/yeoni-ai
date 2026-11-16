import { createOpenAiAdviceHandler, OPENAI_ADVICE_DEPLOYMENT } from '@/lib/openai-advice-server';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// No environment lookup, credentials, budget adapter or provider transport is installed.
// Enabling requires a separately reviewed server-side consent/quote/atomic-ledger integration.
export const POST = createOpenAiAdviceHandler(OPENAI_ADVICE_DEPLOYMENT);

// Fixed public status: no request, authentication, configuration or provider access.
export function GET() {
  return Response.json({ available: false, code: 'OPENAI_ADVICE_NOT_CONNECTED' }, { headers: { 'Cache-Control': 'no-store' } });
}
