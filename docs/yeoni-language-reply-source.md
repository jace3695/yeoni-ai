# 일본어 생성형 답변 입력 준비: 읽기 전용 연결

실제 생성형 AI는 활성화하지 않습니다. `/api/yeoni/record-reply`는 503을 유지하며, 이 연결은 로컬·가상자료로 입력과 버전 규칙을 검증하기 위한 준비 코드입니다. 계정 인증이나 원격 DB의 권한 경계가 아닙니다.

## 입력 범위

기존 안내가 읽던 아홉 키와 `japaneseLevelJourneyV1`, `japaneseChunkReviewV1`를 같은 읽기 스냅샷에서 모읍니다. 명시된 11키의 분석 범위이며, 일본어 앱의 모든 저장 키를 수집했다는 뜻은 아닙니다. 설정, 동기화 원본 사본, 접근 자격정보를 입력에 추가하지 않습니다. 없는 키는 null로 남기며, 학습하지 않음이나 초급을 직접 선택했다는 사실을 만들어 내지 않습니다. 저장된 선택 단계도 숙련도·자동 승급 증거로 취급하면 안 됩니다.

- 레벨 기록은 기존 파서를 재사용하고 루트·답안의 허용 필드 및 루트 시각을 추가 검사합니다. 지원하지 않는 필드는 조용히 삭제하지 않고 입력을 불완전 상태로 처리합니다.
- 보충복습은 기존 version/generation/events 파서와 용량 검사를 재사용합니다. 삭제 세대보다 오래된 이벤트와 현재 추적 이벤트가 없는 빈 객체는 미존재 키와 같은 null로 표현하며 저장된 원본은 수정하지 않습니다. 삭제 표식은 별도 입력으로 유지하므로 이전 키 정리만으로 재분석하지 않습니다. null은 학습하지 않았다는 뜻이 아닙니다. 더 미래인 세대나 손상된 삭제 표식은 차단합니다.
- `languageRecordResetV1`은 명시적인 삭제 경계로 입력 버전에 포함합니다. 실제 캐시의 purge와 원본 저장 트랜잭션 연결은 향후 서버 통합에서 별도로 필요합니다.

## 기록 버전

레벨 선택, 답안, 단원 연습, 보충 이벤트 및 저장된 실제 답안·복습 날짜가 달라지면 내용 해시가 달라집니다. `updatedAt`·`selectionUpdatedAt`이라는 레벨 루트의 병합 시각만 제외합니다. 하위 답안의 `lastAnsweredAt`, `nextReviewAt`, `successDates`나 실제 연습 시각은 제거하지 않습니다.

오늘 날짜, 조회 시각, 현재 화면 경로, 현재 due 목록과 계정 동기화 epoch는 내용 해시에 넣지 않습니다. 날짜 경계·재실행·동일 내용의 동기화만으로 다시 분석하지 않는 계약을 유지합니다. 계정·앱 캐시 격리는 기존 ledger의 별도 범위 키가 담당합니다.

## 읽기와 화면 보호

실행 경로는 기존 일본어 쓰기와 같은 잠금을 얻고 읽습니다. 두 owner, 두 epoch, 삭제 표식, 두 저장 저널과 모든 대상 raw를 재검사합니다. 빈 문자열 저널도 저장 진행/손상 상태로 차단합니다. 저장·복구·병합·이관을 수행하지 않습니다. 잠금이 불가능하면 잠금 없는 읽기로 우회하지 않습니다.

새 입력을 기다리는 동안 이전 source는 현재 입력으로 넘기지 않습니다. 더 최근 이벤트, readiness 하락, 계정 변경, effect 정리 이후 늦은 결과는 표시하지 않습니다. 기존 로컬 규칙 안내, 생성형 답변 비활성 표시, 비활성 듣기 버튼을 구분하며 운동·식단의 동기식 안내와 별도 운동 진행 음성은 변경하지 않습니다.

보호 범위는 해당 잠금을 지키는 로컬 캐시와 관측 가능한 변경입니다. 잠금을 무시하는 구형 코드, 모든 값이 바뀌었다 되돌아오는 ABA, 레벨 기록에 별도 세대가 없는 과거 사본의 출처, 서버 인증·원본 트랜잭션·실제 AI 비용을 증명하지 않습니다. 실제 활성화 전에 권한 있는 서버의 전체 분석 범위와 삭제 정책을 연결해야 합니다.

## 검증 범위

새 두키의 추가·변경·삭제, 메타데이터만 변경할 때 재사용, 날짜 경계, 계정·앱 격리, 오래된/미래 삭제 세대, 손상 데이터, 읽는 중 변경, 지연된 잠금 응답, 미지원 잠금과 실제 TSX 효과의 취소·정리를 가상자료로 검사합니다. 이 자동검사를 로그인 후 실제 기기·클라우드 동기화 검증으로 표현하지 않습니다.


## Storage compatibility integration guard

The canonical language gate is now the synchronous IndexedDB transaction gate, with an optional outer Web Lock. The reader callback remains synchronous and performs no writes or network calls. Missing, denied or aborted IDB fails closed even when Web Locks exist. The successful IDB-only reader path and delayed completion are covered by synthetic fixtures, not claimed as browser proof.

LocalRecordGuidance now hides language input and the local summary immediately when the existing reset-running event starts, blocks refreshes while reset is running, and rechecks after an awaited read. Reset completion re-reads only under the existing readiness contract. Session invalidation is latched for that component mount; timers, route and readiness changes cannot re-adopt leftover owner bytes. A fresh authenticated mount is required to resume. The outer AuthGate normally supplies that lifecycle; its real login flow still requires browser verification.

These guards do not solve server reset A-B-A replay, arbitrary newer reset markers, DELETE/CASCADE or reinsertion. Nor do they serialize old WebLocks-only clients with new IDB-only clients. The separate display-only fallback summary is not an atomic AI snapshot. The SQL prototype stays in docs and is not a deployment migration. Real authoritative revisions, reset issuance/history, cache purge and server concurrency remain gated follow-up work.
