// Approval is intentionally not an environment flag or client-supplied boolean.
// No body parsing, credentials, records, provider import, or fallback API call.
export async function POST() {
  return Response.json({ status: 'disabled', code: 'RECORD_AI_NOT_APPROVED', message: '생성형 답변 연결은 아직 활성화되지 않았어요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
