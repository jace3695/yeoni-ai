import { assertOpaquePreviewOrigin, toggleJournalFailure } from './runtime';
assertOpaquePreviewOrigin(window.origin);
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import MemoriesPage from '../../app/assistant/memories/page';
import { metrics, injectLoss, injectRejection, injectReadFailure, holdNextAuthentication, releaseAuthentication, holdNextWrite, releaseWrites, switchOwner, resetOwner, changeRemote } from './fake-client';

function Fixture() {
  const [info, setInfo] = useState(metrics), [show, setShow] = useState(true);
  useEffect(() => { const refresh = () => setInfo(metrics()); window.addEventListener('fixture-change', refresh); return () => window.removeEventListener('fixture-change', refresh); }, []);
  return <><aside aria-label="가상 기억 시험 제어"><h1>연이 기억 관리 · 가상 자료 시험</h1>
    <p>실제 기억 관리 화면과 저장 로직을 사용하며 인증·DB·브라우저 저장소는 가상입니다. 외부 요청·실제 계정 접근은 차단됩니다. 화면 나가기·돌아오기는 메모리 내 재진입만 검사하며 실제 새로고침은 가상 자료와 복구 정보를 모두 지웁니다.</p>
    <button onClick={injectLoss}>다음 저장 응답과 재조회 실패</button><button onClick={injectRejection}>다음 저장 전송 실패</button>
    <button onClick={injectReadFailure}>다음 결과 조회 실패</button><button onClick={holdNextAuthentication}>다음 인증 응답 대기</button><button onClick={releaseAuthentication}>대기 인증 응답 보내기</button>
    <button onClick={holdNextWrite}>다음 저장 완료 대기</button><button onClick={releaseWrites}>대기 저장 완료하기</button>
    <button onClick={switchOwner}>가상 계정 전환</button><button onClick={resetOwner}>가상 기억 초기화</button><button onClick={changeRemote}>가상 원격 기억 변경</button>
    <button onClick={toggleJournalFailure}>가상 복구정보 저장 실패 전환</button><button onClick={() => setShow(value => !value)}>{show ? '화면 나가기' : '화면 돌아오기'}</button>
    <pre aria-label="가상 기억 저장 상태">{JSON.stringify(info, null, 2)}</pre></aside>
    {show ? <MemoriesPage /> : <p>가상 기억 화면을 나왔어요.</p>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
