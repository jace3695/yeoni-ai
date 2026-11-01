import Link from "next/link";

export default function RetiredPractice({ language = false }: { language?: boolean }) {
  return <section className="mx-auto max-w-2xl space-y-5 px-5 py-12">
    <h1 className="text-2xl font-bold">이 연습은 종료했어요</h1>
    <p>기존 기록은 삭제하지 않고 보관합니다.</p>
    {language && <p>연이에서는 히라가나·가타카나·단어·문법을 배워요. 회화와 발음 연습은 듀오링고나 ChatGPT 음성대화를 이용해 주세요.</p>}
    <Link className="inline-flex min-h-11 items-center rounded-xl bg-violet-700 px-5 text-white" href={language ? "/language" : "/growth"}>{language ? "일본어 학습으로" : "내 자기계발로"}</Link>
  </section>;
}
