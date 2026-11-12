"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { kanaStrokeTimeline } from '@/lib/kana-stroke-timeline';
let bundlePromise: Promise<Record<string, string>> | undefined;
function loadBundle() {
  bundlePromise ??= fetch('/kana-strokes.json').then(response => {
    if (!response.ok) throw Error('Missing kana bundle');
    return response.json() as Promise<Record<string, string>>;
  });
  return bundlePromise;
}
export default function KanaStrokeAnimation({ char, tab, animated = true }: { char: string; tab: 'hiragana' | 'katakana'; animated?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g,'');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const animations: Animation[] = [];
    const targets = Array.from(root.current?.querySelectorAll('svg') ?? []);
    targets.forEach(target => target.replaceChildren());
    setFailed(false);
    void loadBundle().then(bundle => {
      if (cancelled) return;
      const characters = Array.from(char).map((letter,index) => {
        const asset = letter === 'っ' ? 'つ' : letter === 'ッ' ? 'ツ' : letter;
        const path = `/kana-stroke/${letter === 'ー' ? 'katakana' : tab}/${encodeURIComponent(asset)}.svg`;
        if (!bundle[path]) throw Error('Missing kana glyph');
        const parsed = new DOMParser().parseFromString(bundle[path], 'image/svg+xml').documentElement;
        const ids = new Map(Array.from(parsed.querySelectorAll('[id]')).map(node => [node.id,`${id}-${index}-${node.id}`]));
        parsed.querySelectorAll('*').forEach(node => {
          for (const attribute of Array.from(node.attributes)) {
            let value = attribute.value;
            if (attribute.name === 'id') value = ids.get(value) ?? value;
            else for (const [oldId,newId] of ids) value = value.replaceAll(`url(#${oldId})`,`url(#${newId})`).replace(new RegExp(`^#${oldId}$`),`#${newId}`);
            node.setAttribute(attribute.name,value);
          }
        });
        const target = targets[index];
        target.setAttribute('viewBox',parsed.getAttribute('viewBox') ?? '0 0 1024 1024');
        target.replaceChildren(...Array.from(parsed.childNodes).map(node => document.importNode(node,true)));
        // Small ya/yu/yo assets already encode their lower, smaller geometry.
        // Only small tsu lacks a dedicated asset; shrink its full-size fallback.
        if (letter === 'っ' || letter === 'ッ') {
          target.querySelectorAll(':scope > g').forEach(group => group.setAttribute('transform','translate(300 300) scale(.7)'));
        }
        if (!animated) { target.querySelector('[data-strokesvg="strokes"]')?.remove(); return []; }
        return Array.from(target.querySelectorAll<SVGElement>('g[data-strokesvg="strokes"] > *')).map(item => item.matches('path,line,polyline,polygon,circle,ellipse,rect') ? [item as SVGGeometryElement] : Array.from(item.querySelectorAll<SVGGeometryElement>('path,line,polyline,polygon,circle,ellipse,rect')));
      });
      if (!animated) return;
      const timeline = kanaStrokeTimeline(characters.map(strokes => strokes.length));
      const play = () => {
        if (cancelled) return;
        animations.splice(0).forEach(animation => animation.cancel());
        // One origin, one replay timer: marks finish before the following letter starts.
        const origin = document.timeline.currentTime;
        characters.forEach((strokes,characterIndex) => strokes.forEach((parts,strokeIndex) => parts.forEach(part => {
          const length = Math.max(part.getTotalLength(),1);
          part.style.strokeDasharray = `${length}`;
          part.style.strokeDashoffset = `${length}`;
          const start = timeline.characters[characterIndex].starts[strokeIndex];
          part.dataset.strokeStart = String(start);
          part.dataset.strokeEnd = String(start + timeline.duration);
          const animation = part.animate([{strokeDashoffset:`${length}`},{strokeDashoffset:'0'}],{duration:timeline.duration,delay:start,fill:'forwards',easing:'ease-out'});
          if (origin !== null) animation.startTime = origin;
          animations.push(animation);
        })));
        timer = setTimeout(play,timeline.cycle);
      };
      play();
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (timer) clearTimeout(timer); animations.forEach(animation => animation.cancel()); };
  },[char,tab,animated,id]);
  return <div ref={root} data-kana-sequence={animated ? char : undefined} style={{width:'100%',height:'100%',display:'grid',gridTemplateColumns:`repeat(${Array.from(char).length},minmax(0,1fr))`,alignItems:'center',gap:4}}>
    {failed && <span role="status">획순 자료를 불러오지 못했어요. 페이지를 새로고침해 주세요.</span>}
    {Array.from(char).map((letter,index) => <svg key={`${letter}-${index}`} role="img" aria-label={`${letter} ${animated ? '획순 애니메이션' : '따라쓰기 가이드'}`} style={{width:'100%',height:'100%',display:failed?'none':'block','--shadow':'#94a3b8','--stroke':'#111827'} as React.CSSProperties} />)}
  </div>;
}
