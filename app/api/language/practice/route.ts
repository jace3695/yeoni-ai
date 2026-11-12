// Retired product feature: never authenticate, read audio, or invoke a provider.
export function POST() {
  return Response.json({ error: "이 연습은 종료했어요. 일본어 문자 학습을 이용해 주세요.", code: "FEATURE_RETIRED" }, { status: 410 });
}
export const GET = POST;
