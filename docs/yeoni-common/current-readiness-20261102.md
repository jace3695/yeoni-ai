# 공통 호스트 현재 소스의 로컬 준비 확인 · 2026-11-02

기준 `8c649742a945bbcaff0e9185d287c54e91e66163`. 업무 응용 릴리스와 분리한 `agent/readiness-evidence` 작업이다. 제품 코드·기본 정책·원격 환경변수·데이터베이스·실제 기록을 변경하지 않았다. 이 문서/로컬 검증 커밋은 릴리스에 포함하지 않으며 별도 부모 검토 전 push하지 않는다.

## 기존 증거와 이번 보완

과거 `next-page-boundaries-verification.md`는 당시 홈/체중/가계부/비서 입력을 검증했고 `yeoni-common/check.mjs`는 경로·모의 인증 경계·외형 수명을 검증했다. 새 업무 응용10문항 및 이후 수정된 BodyRecordCard를 그 과거 결과에 소급해 포함할 수 없으므로, 이번에는 범위를 좁혀 실제 GrammarPage와 BodyRecordCard를 실제 CommonCharacterShell/Host와 같이 마운트했다.

`scripts/common-current-readiness-local.mjs`는 로컬 루프백 서버만 사용한다. 실제 활성화 정책 함수에 합성 `{NODE_ENV:production, VERCEL_ENV:preview, YEONI_COMMON_CHARACTER_ENABLED:1}`을 전달한다. 이는 호스트 flag-on 분기 검증이며 원격 Preview flag가 켜졌다는 뜻은 아니다. 라우트와 인증 이벤트는 대역이며 authenticatedFetch는 호출 시 거절한다. 같은 출처의 실제 그림/CSS/JS는 읽고, 외부 브라우저 요청은 차단·기록한다. Supabase 인증 실제 세션 갱신 또는 실제 Next 라우터/고정 앱 헤더 통합은 이번 대역 검사로 검증하지 않는다.

## 이번 실행 결과

6/6 흐름 통과, 브라우저 pageerror0, 시도된 외부 origin 요청0:
1. 최신 업무 문법 첫 단원의 실제 입력에 인간형·고양이형을 각각 함께 표시. 9개 내부 좌표 hit-test에서 입력을 가리는 요소 없음,390px 수평 넘침 없음. 포커스 시 quiet=true, 렌더 루프 정지.
2. 모의 인증 계정 변경으로 기존 canvas가 분리되고 새 renderer 하나만 남음. 앱의 cloud-session 이벤트를 별도로 발생시켜 업무 임시 답안 초기화 확인. 이 대역 이벤트 연결을 실계정 전체 서비스 검증이라 하지 않음.
3. 실제 BodyRecordCard 체중 입력9점 확인. `/fitness` 경로는 입력에서 포커스를 빼도 quiet 유지.
4. 실제 삭제 버튼의 브라우저 기본 confirm 창이 열리고 취소 가능. 합성 저장 기록과 입력 초안 유지. 해당 폼에는 별도 DOM modal이 없어 이를 DOM modal의 z-index 검증이라고 부르지 않음.
5.320×420 축소 뷰포트에서도 체중 입력9점 접근 가능. 실제 모바일 키보드나 물리 기기 검증이 아님.
6. 신체 기록 세션 변경 이벤트 후 입력 초안 초기화와 단일 renderer 확인. 저장 버튼/실제 삭제를 실행하지 않음.

화면 증거: `scripts/browser-qa/.generated/common-current-readiness/grammar-mobile.png`, `body-reduced-viewport.png`, `result.json`. 두 화면을 직접 보아 입력 위치와 호스트 배치를 확인했다. 같은 출처 자산 요청은 있었으므로 “네트워크 요청0”이 아니라 **이 합성 환경의 외부 origin 요청0**이다. 실제 auth subscription/session refresh가 있는 소스의 운영 네트워크 부재를 주장하지 않는다.

추가 검사: `node --experimental-strip-types --test lib/yeoni/common-host-policy.test.ts`3/3 통과; 새 로컬 스크립트 ESLint 통과; `git diff --check` 통과. 제품 코드 변경이 없어 전체 검사/프로덕션 빌드를 다시 돌리지 않았다. 기준 릴리스의1684개 검사 및 빌드는 별도 증거다.

초기 검사 준비에서 esbuild 자산 external/대역 resolveDir/authenticatedFetch stub을 보완했고, 실제 `<p>`인 체중 기록을 heading으로 찾던 검사 선택자를 수정했다. 이후 전체6흐름을 재실행해 통과했다. 제품 결함을 수정하거나 테스트 대역을 서비스 구현으로 바꾸지 않았다.

## 남은 범위

부모의 환경변수 이름 감사에는 Preview 활성화 플래그가 없었지만, 사용자 지정 buildCommand 및 실제 배포 런타임은 미확인이다. 운영은 정책상 비활성. 실기기·실제 auth/DB·호스팅 입력 겹침·실음성·미검증 경로의 모든 modal은 별도 검증이다. 이 결과는 원격 활성화나 새 AI/TTS/건강·가계부 쓰기·마이크 사용을 승인하지 않는다.
