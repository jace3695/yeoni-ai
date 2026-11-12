import { assertOpaquePreviewOrigin } from './runtime';
assertOpaquePreviewOrigin(window.origin);
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import GrowthPage from '../../app/growth/page';
import SandboxFormBridge from './form-bridge';
import { injectLoss, injectRejection, switchOwner, metrics, renamePending, resetAfterRequest } from './fake-client';
function Fixture(){const [info,setInfo]=useState(metrics);const [show,setShow]=useState(true);useEffect(()=>{const refresh=()=>setInfo(metrics());window.addEventListener('fixture-change',refresh);return()=>window.removeEventListener('fixture-change',refresh);},[]);return <><aside aria-label="가상 시험 제어"><h1>자기계발 저장 복구 · 가상 자료 시험</h1><p>실제 GrowthPage·useGrowthData·저장 함수 사용. 인증·DB만 가상이며 외부 요청은 차단됩니다. 실제 계정 검증이 아니며 새로고침하면 가상 자료와 재시도 정보가 초기화됩니다. 화면 나가기·돌아오기로 같은 탭의 재진입만 검사합니다. 네이티브 폼 전송은 금지된 채 가상 제출 이벤트로 실제 저장 핸들러를 검사합니다.</p><button onClick={injectLoss}>다음 저장 응답과 재조회 실패</button><button onClick={injectRejection}>다음 저장 전송 실패</button><button onClick={switchOwner}>가상 계정 전환</button><button onClick={renamePending}>가상 저장 행 이름·요일·보관 변경</button><button onClick={resetAfterRequest}>가상 초기화 표식 변경</button><button onClick={()=>setShow(v=>!v)}>{show?'화면 나가기':'화면 돌아오기'}</button><pre aria-label="가상 저장 상태">{JSON.stringify(info,null,2)}</pre></aside>{show?<SandboxFormBridge><GrowthPage/></SandboxFormBridge>:<p>가상 화면을 나왔어요.</p>}</>}
createRoot(document.getElementById('root')!).render(<Fixture/>);
