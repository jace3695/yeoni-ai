# Quote-bound synthetic preparation

이 문서는 가상 비용통제의 로컬 계약이다. 운영 활성화, 서버 인증, 가격 출처 인증, 실제 AI/TTS 호출 또는 배포가 아니다. 새 모듈과 SQL은 애플리케이션 라우트에 연결하지 않는다.

## 적용 범위와 구성

- `synthetic-quote-binding.ts`: 기존 정수 견적기의 결과와 완전한 가상 가격표/FX/세금/마진/요청상한, owner/app/revision/sourceVersion/pool을 하나의 SHA-256 계약에 묶는다.
- 요청 사양에는 `synthetic-only` 제공자, 모델, 사양 버전, 정확한 가상 payload 해시, sourceVersion, 비용 풀, 모든 최대 요금 단위, 최대 시도 1회, 외부 도구 금지를 포함한다. 정규화된 요청 전체의 해시도 계약에 묶는다. 요청 본문과 실제 사용자 기록은 저장하지 않는다.
- `local-quoted-reply.ts`: 숫자 견적을 받는 메서드가 없는 별도 API다. 구형 Client를 상속하지 않으며 reserve/claim은 오직 `reserve_quoted`/`claim_quoted`를 호출한다. SQL/응답 장애 시 numeric 경로로 돌아가지 않는다. 합성 claim ACK는 실제 전송 허가가 아니다.
- `schema.quote-bound.local.sql`: 기존 `schema.local.sql`을 먼저 로드한 로컬 fixture DB에만 덧붙인다. 동일 receipts/policies/sources를 공유하며 별도 비용 원장을 만들지 않는다. 실행 환경/마이그레이션/애플리케이션 자동 로더는 추가하지 않는다.
- 기존 `settle`은 그대로다. 이미 기록한 actual과 다른 정산은 계속 `Settlement conflict`로 거절한다. 덮어쓰기/추가비용 환불/재시도 권한을 추가하지 않는다.

## 영속 메타데이터를 언제 신뢰하는가

기본 상태는 차단이다. 로컬 시험 fixture가 정확한 계약해시를 `quote_fixture_approvals`에 명시 등록하고 DB 시각 신뢰를 별도로 표시한 경우에만 새 예약/claim을 평가한다. Client에는 승인 등록/시계 신뢰 변경 API가 없다. 사용자가 보낸 `dimensionsComplete=true`나 계산된 해시만으로는 허용하지 않는다.

이 표식들은 **합성 fixture의 명시적 가정**이다. 진짜 제공자 가격/요금 누락, FX 권위, 서버 시계 정확성, 사용자 신원 또는 권한을 검증하지 않는다. 해시는 서명도 인증도 아니다. 운영 서버 auth와 서버 소유 가격/완전성 검토 절차, 접근 통제는 미구현이다. 직접 DB를 수정할 수 있는 주체는 승인표를 조작하거나 트리거를 제거할 수 있으므로 이것을 보안 경계로 주장하지 않는다. 실제 연결 전 별도의 권위 있는 서버 계약이 필요하다.

DB는 승인된 해시라도 다시 다음을 검사한다.

- 정확한 키/자료형, owner/app/revision/sourceVersion/pool 일치, 합성 전용 사양.
- 가격표와 FX 각각의 관찰/만료 시각, 미래 관찰 금지, 둘 중 빠른 만료와 계약 만료의 정확한 일치.
- 선언된 모든 필수 요금 차원의 최대 단위/단가 존재, 누락·중복·추가 차원 금지, 정수 범위.
- 각 차원·FX·세금·마진을 정수 `div(n+d-1,d)` 방식으로 올림 재계산하고 계약 금액/실행 상한과 대조.

제공자에게 실제 존재하지만 입력의 필수 목록 전체에서 빠진 요금은 이 로컬 계산만으로 발견할 수 없다. 이를 믿을 수 있는 가격 검토가 아직 없으므로 실제 호출은 계속 비활성이다. 최대 단위 또한 실제 모델 토큰/음성 길이를 강제하는 전송기가 아닌 **무전송 명세**다.

## 예약/claim/재사용

정확한 완료 캐시는 현재 source/session과 tombstone 확인 후 가격보다 먼저 반환한다. 가격·모델·날짜·승인표·시계 신뢰의 변경은 동일 원문을 재생성하거나 비용을 추가하는 이유가 아니다. 원문 `sourceVersion`에는 견적/모델/날짜 메타데이터를 섞지 않는다.

새 예약은 DB 시각으로 유효성을 검사하고 같은 receipts 행에 계약 바이트/quoteId/해시/예약 DB시각을 저장한다. 실제 INSERT 직전에도 DB시각 만료를 확인한다. 같은 owner/app/version/pool의 재예약은 기존 행만 반환한다. 다른 견적·더 긴 유효기간으로 바꾸거나 기존 비용을 낮출 수 없다. legacy 숫자 영수증에도 계약을 나중에 붙이지 않는다. 이 보수적 계약에는 재견적/재시도/재예약을 위한 새로운 전이가 없다.

claim은 같은 영수증/quoteId/정확한 요청 사양, 영수증의 미사용 claim 상태, 현재 source/session, 현재 account/project cap과 모든 기존 부채를 다시 확인한다. DB시각은 잠금 뒤 읽고 실제 claim UPDATE 직전에도 만료를 다시 검사한다. 관찰된 시각이 최초 예약 시각보다 뒤로 돌아가면 중지한다. 임의 시계 조작 탐지나 실제 시간 권위까지 보장하지 않는다.

잠금 순서는 mutex → 해당 receipt(존재 시) → policy → fixture clock → fixture approval이다. clock/approval에는 FOR SHARE 잠금을 사용해 해당 행의 철회/수정과 트랜잭션 커밋 순서를 유지한다. 실제 PostgreSQL 독립 세션에서의 잠금경쟁/교착/격리 검증은 아직 하지 않았다. 이미 반환된 grant를 소급 철회하거나 claim 응답 지연 이후 실제 전송을 차단하는 기능은 없다.

별도 연결에서 로그아웃/삭제하거나 ACK 전달 중 만료되는 경우, 이미 DB에서 완료된 claim의 지연 응답이 `true`이거나 완료 캐시의 지연 응답이 `ready`일 수 있다. 같은 Client 인스턴스의 세션/소스 generation은 해당 인스턴스에서 발생한 변경만 감지한다. 다음 reserve/claim은 새 DB 상태에 따라 중지하고 부채/tombstone을 보존하지만, 서로 다른 Client의 기존 응답이나 실제 전송을 소급 차단하지 않는다.

`LocalReplyDatabase.query`의 성공 응답을 영속 ACK로 해석하려면 해당 호출의 트랜잭션이 실제로 commit된 뒤에만 응답해야 한다. 현재 시험의 PGlite 단일 query는 autocommit 경로다. 외부 `BEGIN` 안에서 함수를 호출해 아직 commit 전인 `true`를 실행 허가로 소비하면 안 된다. 그 상태에서 rollback하면 claim 기록도 rollback되므로 이후 다시 claim할 수 있다. 이 타입 인터페이스는 외부 트랜잭션/프록시의 commit-ACK 의미를 강제하거나 검증하지 않는다. 운영 어댑터는 이를 별도로 보장해야 하며, 합성 함수의 `true`만으로 durable/exactly-once 전송을 주장할 수 없다.

구형 numeric `claim`은 overlay가 설치된 DB에서 `quote_id IS NULL` 영수증만 소비할 수 있다. 따라서 bound 영수증을 numeric API로 claim하는 우회는 막는다. **구형 unbound 준비 API 전체에 가격 만료 보호를 추가한 것은 아니다.** overlay 없이 새 API를 호출하면 오류/차단이며 numeric fallback은 없다. base SQL만 로드하면 원래 준비 경로만 존재한다.

finish 뒤 사용자에게 답을 내보내기 전에는 다시 reserve로 source/session/tombstone을 확인해야 한다. lost commit ACK, 재시작, 만료, 삭제, 소스 편집, 승인 철회 또는 시간 불확실성은 영수증/예약비용/actual 부채를 없애지 않는다. tombstone은 완료 텍스트만 없애고 비용/계약은 보존한다.

## 검증과 남은 일

새 집중 회귀 19개는 PGlite의 로컬 합성 DB를 사용한다. 만료 경계, FX 선만료, 만료 후 재예약, 가격 없는 완료 캐시, numeric 우회, overlay 누락 fallback, 악성 자료형, 필수 수수료 누락, 독립 정수 재계산, 기존 부채/정산충돌, lost ACK 후 동일 DB 재로그인, 소스 편집, tombstone을 검사한다. 별도 디스크 기반 가상 PGlite를 정상 close한 뒤 같은 OS 프로세스에서 새 PGlite 인스턴스로 다시 열어 계약/예약비용/actual 부채/이미 소비한 claim의 보존, 재claim 및 legacy 우회 거절, 보존된 초과부채에 의한 새 예약 차단을 확인한다. strict focused 타입검사와 해당 TS 파일 ESLint를 별도 수행한다.

이 checkpoint는 필요한 파일만 복사한 부분 트리다. `npm test`/전체 앱 빌드가 아니라 아래 집중 명령을 사용한다.

```sh
node --experimental-strip-types --test --test-reporter=tap tests/local-quoted-reply.test.ts
node_modules/.bin/tsc --noEmit --strict --target ES2017 --lib dom,dom.iterable,esnext --module esnext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck lib/yeoni/synthetic-quote-binding.ts lib/yeoni/local-quoted-reply.ts tests/local-quoted-reply.test.ts
node_modules/.bin/eslint lib/yeoni/synthetic-quote-binding.ts lib/yeoni/local-quoted-reply.ts tests/local-quoted-reply.test.ts
```

디스크 기반 PGlite 정상 close→reopen 통과는 같은 OS 프로세스의 정상 저장/재열기 증거다. OS 프로세스 자체 재시작, 독립 PostgreSQL 세션/여러 OS 프로세스 동시성, 네트워크 분할, 프로세스 강제종료, fsync 손실 또는 디스크 crash 검증이 아니다. 전체 회귀·프로덕션 빌드·UI/브라우저 검증은 이 후속 작업에서 실행하지 않았다. 실제 서버 auth, 권위 있는 가격/FX/시간, 전송 직전 재검사와 강제 제한, provider idempotency, 실제 청구서 검증과 append-only 지연 청구 보정은 미구현이다. 이 후속 작업에서는 설치·실DB·외부 API·실자료·push·배포를 하지 않았다. 기존 live record-reply API는 503을 유지한다.
