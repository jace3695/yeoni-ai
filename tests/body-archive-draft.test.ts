import test from 'node:test';
import assert from 'node:assert/strict';
import {stageBodyArchiveDraft,readBodyArchiveDraft,clearBodyArchiveDraft} from '../lib/body-archive-draft.ts';
test('explicit memory handoff is owner/epoch bound and never persisted',()=>{
 const map=new Map([['fitness-cloud-sync-user','synthetic-a'],['fitness-cloud-sync-epoch','1']]);
 const events=new Map<string,Function[]>();let writes=0;
 Object.assign(globalThis,{window:{addEventListener:(name:string,fn:Function)=>events.set(name,[...(events.get(name)??[]),fn])},localStorage:{getItem:(key:string)=>map.get(key)??null,setItem:()=>writes++}});
 const candidate={ownerId:'synthetic-a',snapshot:{version:1 as const,source:'local-rules' as const,date:'2026-11-04',text:'synthetic'}};
 assert.equal(stageBodyArchiveDraft(candidate),true);assert.deepEqual(readBodyArchiveDraft('synthetic-a'),candidate);assert.equal(writes,0);
 map.set('fitness-cloud-sync-epoch','2');assert.equal(readBodyArchiveDraft('synthetic-a'),null);
 assert.equal(stageBodyArchiveDraft(candidate),true);for(const fn of events.get('pagehide')??[])fn();assert.equal(readBodyArchiveDraft('synthetic-a'),null);
 assert.equal(stageBodyArchiveDraft(candidate),true);map.set('fitness-cloud-sync-user','synthetic-b');assert.equal(readBodyArchiveDraft('synthetic-b'),null);assert.equal(stageBodyArchiveDraft(candidate),false);assert.equal(writes,0);clearBodyArchiveDraft();
});
