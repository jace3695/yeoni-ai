import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('app/budget/page.tsx','utf8');
const manual=readFileSync('app/budget/components/manual-entry.tsx','utf8');
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
