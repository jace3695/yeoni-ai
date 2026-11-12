import test from 'node:test';
import assert from 'node:assert/strict';
import { kanaStrokeTimeline } from './kana-stroke-timeline.ts';
for (const [text, counts] of [['きゃ',[4,3]],['ぎゃ',[6,3]],['ぴゅ',[2,2]],['キャ',[3,2]],['ギャ',[5,2]],['ピョ',[3,3]]] as const) {
  test(`${text}: all first-letter strokes including marks finish before small kana; whole word replay`, () => {
    const plan = kanaStrokeTimeline(counts);
    assert.ok(plan.characters[1].starts[0] > plan.characters[0].end);
    const starts = plan.characters.flatMap(item => item.starts);
    assert.equal(starts.length, counts.reduce((sum, count) => sum + count, 0));
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] >= starts[i-1] + plan.duration);
    assert.ok(plan.cycle > plan.characters.at(-1)!.end + 1000);
  });
}
test('single letter, missing and invalid stroke counts', () => {
 assert.equal(kanaStrokeTimeline([1]).characters[0].starts[0],350);
 for (const bad of [0,-1,1.2,NaN]) assert.throws(()=>kanaStrokeTimeline([bad]));
});
