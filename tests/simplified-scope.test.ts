import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('all direct retired pages render only the safe notice, without feature initialization',()=>{
 for(const route of ['growth/typing','growth/typing/basics','growth/drawing','language/practice','language/practice/access-check','language/conversation','language/speaking']) {
  const exports: {default?:()=>{type:string;props:{language?:boolean}}}={};
  const source=ts.transpileModule(read(`app/${route}/page.tsx`),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports,require:(name:string)=>{
   if(name==='react/jsx-runtime') return {jsx:(type:string,props:unknown)=>({type,props})};
   assert.equal(name,'@/components/RetiredPractice');return {default:'retired'};
  }});
  assert.equal(exports.default!().type,'retired');
  assert.equal(Boolean(exports.default!().props.language),route.startsWith('language/'));
 }
});
test('remaining navigation and focused lessons do not initialize retired practice',()=>{
 for(const path of ['app/growth/page.tsx','app/language/page.tsx','components/TopNav.tsx']) assert.doesNotMatch(read(path),/href=["']\/(?:growth\/(?:typing|drawing)|language\/(?:conversation|speaking|practice))/);
 const lesson=read('components/language/FocusedLesson.tsx');
 assert.doesNotMatch(lesson,/MediaRecorder|getUserMedia|toggleRecording/);
 assert.match(lesson,/visibleStages = \[0, 1, 4\]/);
 for(const area of ['kana','words','grammar']) assert.match(read(`app/language/${area}/page.tsx`),/useLearningAudio/);
});
