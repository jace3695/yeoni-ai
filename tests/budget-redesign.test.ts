import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('app/budget/page.tsx','utf8');
const manual = readFileSync('app/budget/components/manual-entry.tsx','utf8');
const css = readFileSync('app/budget/budget-redesign.css','utf8');
test('input method switches preserve mounted draft and block switching while busy',()=>{
 assert.match(page,/useState<'manual' \| 'sentence'>\('manual'\)/);
 assert.match(page,/hidden=\{entryMode !== 'sentence'\}/);
 assert.match(page,/hidden=\{showConfirm \|\| entryMode !== 'manual'\}/);
 assert.match(page,/draft=\{manualEntry.draft\}/);
 assert.equal((page.match(/<ManualEntry /g)||[]).length,1);
 for(const mode of ['manual','sentence']) assert.ok(page.includes(`disabled={aiLoading || listening || isSavingRecords || hasPendingSave} onClick={() => setEntryMode('${mode}')}`));
 assert.match(css,/\.record-screen \[hidden\] \{ display: none !important/);
});
test('home prioritizes budget and keeps companion and scoped recent records',()=>{
 const home=page.slice(page.indexOf("{tab === 'home' && ("),page.indexOf("{tab === 'input' && ("));
 assert.ok(home.indexOf('budget-home-actions')<home.indexOf('home-overview-card'));
 assert.ok(home.indexOf('home-overview-card')<home.indexOf('<CommonCharacterGuide>'));
 assert.ok(home.indexOf('<CommonCharacterGuide>')<home.indexOf('budget-home-details'));
 assert.ok(home.indexOf('budget-home-details')<home.indexOf('home-recent-card'));
 assert.match(home,/전체 기간 최근 기록/);
 assert.match(home,/selectedMonthLabel\} 기록 기준/);
 assert.match(home,/isIncome \? '\+' : isSaving \? '' : '−'/);
 assert.match(home,/label: '지출', value: total, tone: 'expense', sign: '−'/);
});
test('unsupported transfer and refund behavior is disclosed without changing save contracts',()=>{
 assert.match(page,/내 계좌 사이 이동을 자동으로 제외하는 기능은 아닙니다/);
 assert.match(page,/카드대금 납부 때 다시 지출로 적으면 합계가 중복/);
 assert.match(page,/원래 지출이 자동 취소되지는 않아요/);
 assert.match(page,/pendingSaveRef.current \?\?/);
 assert.match(page,/save_budget_batch/);
});
test('manual form uses light semantic classes and retains guarded submit',()=>{
 assert.match(manual,/className="budget-manual-form"/);
 assert.match(manual,/if\(disabled\|\|!owner\)return/);
 assert.match(manual,/onReview\(manualBudgetItem\(draft,categories\),owner\)/);
 assert.match(manual,/hidden=\{hidden\}/);
 assert.doesNotMatch(manual,/#101018|#E8A87C|color:'#fff'/);
});
function l(h:string){const c=h.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];}
test('normal-text foreground pairs meet AA contrast and respect reduced motion',()=>{
 for(const [a,b]of[['252331','ffffff'],['646170','ffffff'],['646170','f6f6f9'],['ffffff','6750a4'],['493278','f0eef7'],['146b5b','ffffff'],['b33848','ffffff'],['465d88','ffffff']])assert.ok((Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05)>=4.5,`${a}/${b}`);
 assert.match(css,/prefers-reduced-motion: reduce/);
 assert.match(css,/min-height: 48px/);
});

test('successful save clears only the originating entry method draft',()=>{
 const success=page.slice(page.indexOf('      setShowConfirm(false)',page.indexOf("supabase.rpc('save_budget_batch'")),page.indexOf('      setFeedback(String(data?.count'));
 for(const isManual of [true,false]) {
  let sentence='남겨 둔 문장 초안'; let direct='남겨 둔 직접 입력';
  const run=new Function('reviewWasManual','manualEntry','setManualReset','setInput','setShowConfirm','setParsedItems','setEntryCoolingDown',success);
  run({current:isManual},{clear(){direct=''}},()=>{},(v:string)=>{sentence=v},()=>{},()=>{},()=>{});
  assert.equal(sentence,isManual?'남겨 둔 문장 초안':'');
  assert.equal(direct,isManual?'':'남겨 둔 직접 입력');
 }
});
test('theme tokens outrank legacy scoped defaults and delete button has dark text',()=>{
 assert.match(css,/\.budget-app-shell\.budget-app-shell \{/);
 assert.match(page,/color: '#9b2437', fontSize: 11/);
 for(const [a,b]of[['9b2437','ffffff'],['9b2437','fff1f1'],['8b5e12','ffffff']])assert.ok((Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05)>=4.5);
});

test('save completion briefly blocks pointer click-through and points to the visible input tab',()=>{
 assert.match(page,/inert=\{entryCoolingDown\}/);
 assert.match(page,/setEntryCoolingDown\(true\)/);
 assert.match(page,/window.setTimeout\(\(\) => setEntryCoolingDown\(false\), 600\)/);
 assert.match(page,/return \(\) => window.clearTimeout\(timer\)/);
 assert.doesNotMatch(page,/직접 입력하려면 아래 상세 항목/);
});


test('history filter labels and CSV action use scoped semantic colors with AA contrast',()=>{
 const history=readFileSync('app/budget/components/history-screen.tsx','utf8');
 for(const label of ['시작일','종료일','유형','지출 카테고리']) {
  const tag=history.match(new RegExp(`<label ([^>]+)>\\s*${label}\\s*<`))?.[1];
  assert.ok(tag,`Missing history label: ${label}`);
  assert.match(tag,/color: 'var\(--foreground\)'/);
  assert.doesNotMatch(tag,/#E0E0EA/i);
 }
 const csv=history.match(/<button[^>]+>현재 결과 CSV 저장<\/button>/)?.[0];
 assert.ok(csv);
 assert.match(csv,/color: 'var\(--sage-dark\)'/);
 assert.match(csv,/background: 'var\(--surface\)'/);
 assert.match(csv,/border: '1px solid var\(--border\)'/);
 assert.match(csv,/disabled=\{Boolean\(filterError\)\}/);
 assert.match(csv,/onClick=\{exportFilteredHistoryCsv\}/);
 // The doubly scoped redesign tokens win over the older app defaults.
 const scope=css.match(/\.budget-app-shell\.budget-app-shell \{([^}]+)\}/)?.[1];
 assert.ok(scope);
 for(const [token,value]of [['foreground','yeoni-ink'],['sage-dark','yeoni-primary-dark'],['surface','yeoni-surface']]) {
  assert.ok(scope.includes(`--${token}: var(--${value});`));
 }
 const color=(token:string)=>scope.match(new RegExp(`--${token}: #([a-fA-F0-9]{6});`))![1];
 const background=color('yeoni-surface');
 for(const foreground of [color('yeoni-ink'),color('yeoni-primary-dark')]) {
  assert.ok((Math.max(l(foreground),l(background))+.05)/(Math.min(l(foreground),l(background))+.05)>=4.5);
 }
});

test('sentence option comes first without changing manual default or draft guards',()=>{
 const start=page.indexOf('className="budget-entry-switch"');
 const options=page.slice(start,page.indexOf('</div>',start));
 const sentenceIndex=options.indexOf('>문장으로 입력</button>');
 const manualIndex=options.indexOf('>직접 적기</button>');
 assert.ok(sentenceIndex >= 0 && manualIndex >= 0, 'both entry options must exist');
 assert.ok(sentenceIndex < manualIndex);
 assert.ok(page.includes("useState<'manual' | 'sentence'>('manual')"));
 for(const mode of ['sentence','manual'])assert.ok(options.includes(`disabled={aiLoading || listening || isSavingRecords || hasPendingSave} onClick={() => setEntryMode('${mode}')}`));
});
test('entry labels use neutral financial terminology',()=>{
 assert.doesNotMatch(manual,/쓴 돈|받은 돈/);
 assert.match(manual,/<option value="expense">지출<\/option>/);
 assert.match(manual,/<option value="income">수입<\/option>/);
});
test('Yeoni remains in home diagnosis and consultation, suspended in entry and history',()=>{
 assert.ok(page.includes("<CommonCharacterSuspension active={tab !== 'home' && !(tab === 'analysis' && analysisView === 'ai')} />"));
 assert.match(page,/<CommonCharacterGuide>[\s\S]*?home-yeoni-diagnosis[\s\S]*?<\/CommonCharacterGuide>/);
 assert.match(page,/<CommonCharacterSlot>[\s\S]*?연이의 가계부 상담[\s\S]*?<\/CommonCharacterSlot>/);
 assert.doesNotMatch(page,/AI 상담|쓴 돈이나 받은 돈을 적어요/);
});
