import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidInbodyRecord } from './recordStorage.ts';

const source = { device: 'InBody 270S English report', originalLabel: ' Body Age ', originalUnit: ' years ', originalText: ' 31 years ', method: 'ocr', mappingVersion: 'inbody-270s-en-v1' };
const record = { bmi: 23.4, impedance: 510, measurementTime: '09:30:00', bodyShape: ' standard ', reportedBodyAgeUnit: ' years ', memo: ' synthetic memo ', metricSources: { reportedBodyAge: source } };

test('current body text and provenance metadata validate without normalization', () => {
  const before = JSON.stringify(record);
  assert.equal(isValidInbodyRecord(record), true);
  assert.equal(JSON.stringify(record), before);
  assert.equal(isValidInbodyRecord({ measurementTime: '09:30', futureMetric: 0 }), true);
  assert.equal(isValidInbodyRecord({}), true);
});

for (const [label, value] of Object.entries({
  nullRecord: null, arrayRecord: [], unknownText: { futureMetric: '1' }, negativeMetric: { bmi: -1 }, infiniteMetric: { bmi: Infinity },
  badTime: { measurementTime: '25:00:00' }, numericText: { bodyShape: 1 }, nullSources: { metricSources: null }, arraySources: { metricSources: [] },
  nullSource: { metricSources: { bmi: null } }, arraySource: { metricSources: { bmi: [] } },
  badDevice: { metricSources: { bmi: { ...source, device: 'unknown' } } }, badMethod: { metricSources: { bmi: { ...source, method: 'manual' } } },
  badMapping: { metricSources: { bmi: { ...source, mappingVersion: 'unknown' } } }, badOptional: { metricSources: { bmi: { ...source, originalText: {} } } },
  extraSourceObject: { metricSources: { bmi: { ...source, extra: {} } } }, missingLabel: { metricSources: { bmi: { ...source, originalLabel: undefined } } },
  dangerousMetric: JSON.parse('{"metricSources":{"__proto__":{}}}'), dangerousField: JSON.parse('{"constructor":0}'),
  inheritedRecord: Object.assign(Object.create({ bmi: 1 }), { memo: 'synthetic' }),
  inheritedSource: { metricSources: { bmi: Object.create(source) } },
})) test(`malformed body metadata is rejected: ${label}`, () => assert.equal(isValidInbodyRecord(value), false));
