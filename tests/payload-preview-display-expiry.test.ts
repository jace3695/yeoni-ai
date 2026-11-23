import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {remainingPreviewDisplay,startPreviewDisplay} from '../lib/payload-preview-display-expiry.ts';
test('successful receipt stays visible precisely until the five-minute deadline',()=>{
 const initial={wall:10_000,monotonic:5_000},deadline=startPreviewDisplay(initial);
 assert.equal(remainingPreviewDisplay(deadline,initial),300_000);
 assert.equal(remainingPreviewDisplay(deadline,{wall:309_999,monotonic:304_999}),1);
 assert.equal(remainingPreviewDisplay(deadline,{wall:310_000,monotonic:305_000}),0);
});
test('clock rollback or sleeping the tab cannot extend an expired preview',()=>{
 const deadline=startPreviewDisplay({wall:10_000,monotonic:5_000});
 assert.equal(remainingPreviewDisplay(deadline,{wall:1_000,monotonic:305_000}),0);
 assert.equal(remainingPreviewDisplay(deadline,{wall:370_000,monotonic:5_000}),0);
});
test('new explicit success independently gets a fresh display lifetime',()=>{
 const old=startPreviewDisplay({wall:10_000,monotonic:5_000}),now={wall:311_000,monotonic:306_000},next=startPreviewDisplay(now);
 assert.equal(remainingPreviewDisplay(old,now),0);
 assert.equal(remainingPreviewDisplay(next,now),300_000);
});
test('expiration checks visibility/restore and only clears the matching preview; no automatic fetch',()=>{
 const ui=readFileSync(new URL('../app/settings/openai-connection-test/PayloadPreviewPanel.tsx',import.meta.url),'utf8');
 assert.match(ui,/document\.addEventListener\('visibilitychange',recheck\)/);
 assert.match(ui,/window\.addEventListener\('pageshow',recheck\)/);
 assert.match(ui,/setPreview\(current=>current===preview\?null:current\)/);
 assert.equal(ui.match(/requestPayloadPreview\(/g)?.length,1);
 assert.match(ui,/onClick=\{\(\)=>void run\(\)\}/);
});
