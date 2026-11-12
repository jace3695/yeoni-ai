import Link from "next/link";

const areas = [
  { title: "히라가나·가타카나", text: "あ부터 ア까지, 글자와 읽는 법을 익히고 짧은 퀴즈로 확인해요.", href: "/language/kana", mark: "あ ア" },
  { title: "단어", text: "자주 쓰는 단어의 뜻과 읽는 법을 배우고 복습해요.", href: "/language/words", mark: "言葉" },
  { title: "문법", text: "한국어 설명과 예문으로 문장 만드는 법을 익혀요.", href: "/language/grammar", mark: "文法" },
];
export default function LanguagePage() {
  return <section className="mx-auto max-w-4xl space-y-7 py-6">
    <header><p className="text-sm font-semibold text-violet-700">내 속도로 배우는 일본어</p><h1 className="mt-2 text-3xl font-bold">글자부터 문장까지</h1><p className="mt-3 text-slate-600">히라가나·가타카나·단어·문법을 하나씩 배워요.</p></header>
    <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6"><h2 className="text-xl font-bold">초급·중급·고급, 내가 고르는 학습 단계</h2><p className="my-3 leading-7">초급을 충분히 반복하고 준비되면 직접 중급을 선택해요. 다음 단계에서도 이전 학습과 복습 기록은 그대로예요.</p><Link className="inline-flex min-h-11 items-center rounded-xl bg-violet-700 px-5 text-white" href="/language/levels">단계별로 배우기</Link></section>
    <div className="grid gap-4 sm:grid-cols-3">{areas.map(area => <article key={area.href} className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm"><span lang="ja" className="text-3xl text-violet-700">{area.mark}</span><h2 className="mt-4 text-xl font-bold">{area.title}</h2><p className="my-3 flex-1 text-sm leading-6 text-slate-600">{area.text}</p><Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-700 px-4 text-white" href={area.href}>{area.title} 배우기</Link></article>)}</div>
    <div className="flex flex-wrap gap-3"><Link className="rounded-xl border p-3" href="/language/learn">순서대로 배우기</Link><Link className="rounded-xl border p-3" href="/language/review">저장한 내용 복습</Link><Link className="rounded-xl border p-3" href="/language/chunk-review">표현 조각 보충복습</Link><Link className="rounded-xl border p-3" href="/language/progress">내 학습 기록</Link></div>
    <p className="rounded-2xl bg-violet-50 p-5 text-sm leading-6">회화와 발음 연습은 듀오링고나 ChatGPT 음성대화를 이용해 주세요. 연이에서는 문자와 문법 학습에 집중해요.</p>
  </section>;
}
