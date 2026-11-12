/** No session, credential, account or service is available in the fixture. */
export async function authenticatedJsonHeaders(): Promise<Record<string, string>> {
  throw new Error('가상 검사에서는 인증 정보와 외부 요청을 사용할 수 없어요.');
}
