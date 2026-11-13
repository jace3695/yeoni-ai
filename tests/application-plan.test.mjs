import {test} from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {CURRICULUM as current} from '../data/curriculum.ts';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/japanese-legacy-94a.json',import.meta.url),'utf8'));
const legacy=fixture.lessons;
import * as plan from '../utils/learningSession.ts';

import {parseCurriculumProgress} from '../utils/curriculumProgress.ts';
const affected=current.filter(l=>l.quiz.length===10);
test('24 affected lessons append48 authored choices without changing any existing question',()=>{
 const digest=path=>createHash('sha256').update(readFileSync(new URL(path,import.meta.url))).digest('hex');
 assert.equal(digest('../data/japaneseApplicationQuiz.ts'),'4932caeda91e7da237450b2294c672938a59eb6c07566209e80bc2dea6b3effd');
 assert.equal(digest('./fixtures/japanese-legacy-94a.json'),'2ecb9345a05fa68a98ebbfed3cb6fef52cdcc4f77d2261812d0a17b9b05f1f58');
 assert.equal(affected.length,24);assert.equal(current.length,62);
 for(const l of current){const before=legacy.find(x=>x.id===l.id);assert.deepEqual(l.quiz.slice(0,8),before.quiz);assert.deepEqual({...l,quiz:before.quiz},before);}
});
test('372 legacy configurations resume with same plan, score, cursor, fields and review identity',()=>{
 for(const l of current)for(const minutes of [5,10,20])for(const mode of ['starter','reader']){
 const contract=fixture.contracts.find(x=>x.lessonId===l.id&&x.minutes===minutes&&x.mode===mode);const s=structuredClone(contract.session);
 const input=JSON.stringify(s);const restored=plan.normalizeLearningSession(s,l,true);
 assert.equal(JSON.stringify(s),input);assert.equal(restored.quizPlanVersion,undefined);assert.deepEqual(restored,s);assert.deepEqual(plan.getSessionQuizIndices(l,minutes),contract.indices);assert.deepEqual(plan.getSessionResult(l,restored),contract.result);
 assert.deepEqual(plan.updateSessionReviews([],l,restored,new Date('2026-01-01')),contract.reviews);
 }
});
test('144 new affected configurations include fragment+application; JSON reload retains V2',()=>{
 for(const l of affected)for(const minutes of [5,10,20])for(const mode of ['starter','reader']){
 let s=plan.createLearningSession(l.id,minutes,mode);assert.equal(s.quizPlanVersion,2);
 const indices=plan.getSessionQuizIndices(l,minutes,s.quizPlanVersion);assert.equal(indices.length,{5:3,10:5,20:8}[minutes]);assert.ok(indices.includes(8)&&indices.includes(9));assert.equal(new Set(indices).size,indices.length);
 for(const i of indices){const choices=plan.getQuestionChoices(l,i,mode);assert.equal(choices.filter(c=>c.correct).length,1);assert.ok(choices.length>=2);s=plan.answerSessionQuestion(s,i,true,choices.find(c=>c.correct).label,{responseMs:1000,neededHelp:false,modality:'meaning'});}
 const parsed=parseCurriculumProgress(JSON.stringify({activeSession:s,lessonDrafts:{[l.id]:s}}));const restored=plan.normalizeLearningSession(parsed.activeSession,l,true);assert.deepEqual(restored,s);assert.equal(plan.getSessionResult(l,restored).score,100);assert.equal(plan.getSessionResult(l,restored).complete,true);
 const oldReview={id:l.id+':1',lessonId:l.id,lessonTitle:l.title,prompt:'old first-word question',explanation:'old',createdAt:'2026-01-01'};
 const reviews=plan.updateSessionReviews([oldReview],l,restored,new Date('2026-01-02'));assert.deepEqual(reviews.find(x=>x.id===oldReview.id),oldReview);assert.equal(reviews.find(x=>x.id===l.id+':9').prompt,l.quiz[9].prompt);
 }
});
test('unknown plan fails closed, no record mutation; unaffected new lessons retain old selection',()=>{
 const l=affected[0];const bad={...plan.createLearningSession(l.id,20,'starter'),quizPlanVersion:3};const raw=JSON.stringify(bad);assert.throws(()=>plan.normalizeLearningSession(bad,l,true));assert.equal(JSON.stringify(bad),raw);assert.throws(()=>plan.getSessionQuizIndices(l,20,3));assert.throws(()=>plan.getSessionQuizIndices(l,20,null));
 for(const item of current.filter(l=>l.quiz.length===8))for(const m of [5,10,20]){const s=plan.createLearningSession(item.id,m,'reader');assert.equal(s.quizPlanVersion,undefined);assert.deepEqual(plan.getSessionQuizIndices(item,m,s.quizPlanVersion),fixture.contracts.find(x=>x.lessonId===item.id&&x.minutes===m&&x.mode==='reader').indices);}
});

test('real storage functions preserve new/legacy drafts across save, reload and same-owner reconstructed cache',async()=>{
 const {loadCurriculumProgress,saveCurriculumProgress,CURRICULUM_PROGRESS_KEY}=await import('../utils/curriculumProgress.ts');
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
 class MemoryStorage{values=new Map();getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
 try{
 const storage=new MemoryStorage();Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:storage}});storage.setItem('language-cloud-sync-user','synthetic-owner');
 const legacySession=structuredClone(fixture.contracts.find(x=>x.lessonId==='f14'&&x.minutes===20&&x.mode==='starter').session);
 let p=loadCurriculumProgress();p=saveCurriculumProgress(plan.withLearningSessionDraft(p,legacySession));
 const l=current.find(x=>x.id==='f13');let s=plan.createLearningSession('f13',5,'starter');s={...plan.answerSessionQuestion(s,8,true,l.quiz[8].choices[0]),quizCursor:2,stage:4};
 saveCurriculumProgress(plan.withLearningSessionDraft(loadCurriculumProgress(),s));
 let read=loadCurriculumProgress();assert.deepEqual(plan.normalizeLearningSession(read.lessonDrafts.f13,l,true),s);assert.deepEqual(read.lessonDrafts.f14,legacySession);
 const saved=storage.getItem(CURRICULUM_PROGRESS_KEY);const reconstructed=new MemoryStorage();reconstructed.setItem('language-cloud-sync-user','synthetic-owner');reconstructed.setItem(CURRICULUM_PROGRESS_KEY,saved);
 globalThis.window.localStorage=reconstructed;read=loadCurriculumProgress();const restored=plan.normalizeLearningSession(read.lessonDrafts.f13,l,true);assert.equal(restored.quizPlanVersion,2);assert.equal(plan.getSessionQuizIndices(l,5,restored.quizPlanVersion)[restored.quizCursor],9);assert.deepEqual(read.lessonDrafts.f14,legacySession);assert.equal(reconstructed.getItem(CURRICULUM_PROGRESS_KEY),saved);
 // Owner transition after read is still rejected by the existing write guard.
 reconstructed.setItem('language-cloud-sync-user','other-synthetic-owner');assert.throws(()=>saveCurriculumProgress(read));assert.equal(reconstructed.getItem(CURRICULUM_PROGRESS_KEY),saved);
 }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
});
