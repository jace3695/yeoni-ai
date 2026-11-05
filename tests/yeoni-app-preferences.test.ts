import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAppYeoniPreferences,parseYeoniPreferences,yeoniAppForPath,yeoniAppPreferencesKey,YEONI_APPS} from '../utils/yeoniPreferences.ts';
test('all existing app routes and settings map to own preference scope',()=>{
 for(const app of Object.keys(YEONI_APPS)){assert.equal(yeoniAppForPath('/'+app+'/settings'),app);assert.equal(yeoniAppForPath('/'+app+'/nested/page'),app);}
 for(const path of ['/','/settings','/unknown'])assert.equal(yeoniAppForPath(path),'assistant');
});
test('owner-scoped keys do not collide with guest or each other',()=>{
 const keys=[null,'guest','account:a','a','a:b','a%3Ab'].map(yeoniAppPreferencesKey);assert.equal(new Set(keys).size,keys.length);
});
test('missing or malformed app data inherits global without mutating legacy input',()=>{
 const global=JSON.stringify({visible:false,motion:'off',appearance:'human'});const fallback=parseYeoniPreferences(global);
 for(const raw of [null,'broken','[]','{"fitness":null,"growth":[]}']){const apps=parseAppYeoniPreferences(raw);assert.deepEqual(apps.fitness??fallback,{visible:false,motion:'off',appearance:'human'});}
 assert.equal(global,'{"visible":false,"motion":"off","appearance":"human"}');
});
test('independent apps retain three motion modes and normalize unsupported fields',()=>{
 const apps=parseAppYeoniPreferences('{"assistant":{"motion":"reactions"},"fitness":{"motion":"off","visible":false},"growth":{"motion":"home","appearance":"human"},"unknown":{"visible":false}}');
 assert.equal(apps.assistant?.motion,'reactions');assert.equal(apps.fitness?.visible,false);assert.equal(apps.growth?.appearance,'human');assert.equal(Object.keys(apps).length,3);
});
test('dedicated settings entry points target their own app',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const [file,app] of [['app/language/settings/page.tsx','language'],['app/budget/page.tsx','budget']])assert.match(readFileSync(new URL('../'+file,import.meta.url),'utf8'),new RegExp('<YeoniPreferencesPanel app="'+app+'"'));
 assert.doesNotMatch(readFileSync(new URL('../app/calendar/settings/page.tsx',import.meta.url),'utf8'),/YeoniPreferencesPanel|AppCompanion/);
 assert.match(readFileSync(new URL('../app/components/AppRecordSettings.tsx',import.meta.url),'utf8'),/<YeoniPreferencesPanel app=\{app\}/);
});
