import { PREVIEW_CHUNK_CATALOG, PREVIEW_CURRICULUM_CATALOG, PREVIEW_READING_CATALOG, previewTrack } from './catalog';
import { previewHash } from './navigation';

export default function PreviewCatalog({ track }: { track?: string | null }) {
  const selectedTrack = previewTrack(track ?? null);
  const curriculum = selectedTrack ? PREVIEW_CURRICULUM_CATALOG.filter(item => item.track === selectedTrack) : PREVIEW_CURRICULUM_CATALOG;
  const sections = [
    { id: 'curriculum', title: '기존 본수업', items: curriculum },
    { id: 'reading', title: '읽기·표현 비교', items: PREVIEW_READING_CATALOG },
    { id: 'chunks', title: '표현 조각 보충연습', items: PREVIEW_CHUNK_CATALOG },
  ];
  return <section className="qa-catalog" aria-label="전체 단원 검사 목차">
    <h1>모든 단원을 직접 골라 확인해요</h1>
    <p>실제 수업 데이터와 같은 ID예요. 목차에서 고르는 것만으로 선택 단계나 진도를 바꾸지 않아요. 수업의 저장 동작은 이 화면의 가상 메모리에만 기록돼요.</p>
    <p>기존 본수업 {PREVIEW_CURRICULUM_CATALOG.length}개 · 읽기 {PREVIEW_READING_CATALOG.length}개 · 표현 조각 {PREVIEW_CHUNK_CATALOG.length}개</p>
    {selectedTrack && <p>기존 본수업은 요청한 과정 {curriculum.length}개를 표시했어요. <a href={previewHash('/language/qa-catalog')}>전체 과정 보기</a></p>}
    <div className="qa-catalog-sections">{sections.map(section => <section key={section.id} aria-labelledby={`qa-${section.id}`}>
      <h2 id={`qa-${section.id}`}>{section.title} · {section.items.length}개</h2>
      <label className="qa-picker">{section.title} 바로 열기
        <select defaultValue="" onChange={event => { if (event.target.value) location.hash = event.target.value; }}>
          <option value="" disabled>단원을 선택하세요</option>
          {[...new Set(section.items.map(item => item.group))].map(group => <optgroup key={group} label={group}>
            {section.items.filter(item => item.group === group).map(item => <option key={item.id} value={item.href}>{item.id} · {item.title}</option>)}
          </optgroup>)}
        </select>
      </label>
      <details><summary>전체 {section.items.length}개 링크 펼치기</summary>
        <ol>{section.items.map(item => <li key={item.id}><a href={item.href}>{item.id} · {item.title}</a><small>{item.group}{'expression' in item ? ` · ${item.expression}` : ''}</small></li>)}</ol>
      </details>
    </section>)}</div>
  </section>;
}
