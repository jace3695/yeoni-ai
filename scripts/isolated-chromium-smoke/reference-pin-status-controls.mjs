import assert from 'node:assert/strict';

// Closed synthetic requests only. No browser, account, network or request headers.
export async function verifyReferencePinStatusGuard(helper) {
  const url = 'http://127.0.0.1:3000/api/pin', body = '{"action":"status"}';
  const valid = [[url, 'POST', body], [url, 'POST', ' { "action" : "status" }\n'], [url, 'POST', body.padEnd(256, ' ')]];
  const denied = [
    ...['set', 'verify', 'reauth', 'reauthenticate', 'disable'].map(action => [url, 'POST', JSON.stringify({ action })]),
    ...['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'post'].map(method => [url, method, body]),
    ...['https://127.0.0.1:3000/api/pin', 'http://localhost:3000/api/pin', 'http://127.0.0.1:3001/api/pin',
      'http://127.0.0.1:3000/api/pin?', `${url}?x=1`, `${url}#x`, `${url}/`,
      'http://127.0.0.1:3000/api/language/tts', 'http://127.0.0.1:3000/api/chat',
      'http://user@127.0.0.1:3000/api/pin', 'http://127.0.0.1:3000/api/%70in',
      'http://127.0.0.1:3000/x/../api/pin', 'https://private.invalid/api/pin'].map(value => [value, 'POST', body]),
    ...[null, '', '{', 'null', '[]', 'true', '1', '"status"', '{}', '{"action":null}',
      '{"action":"status","extra":true}', '{"action":"status","__proto__":{}}',
      '{"action":"status","constructor":{}}', '{"action":"status","action":"status"}',
      '{"action":"status"}x', ' '.repeat(257) + body,
      '{"action":"\\u0073tatus"}', body.padEnd(257, ' '), '\uFEFF' + body, '\u00A0' + body, '\u000B' + body].map(value => [url, 'POST', value]),
  ];
  let positives = 0, negatives = 0;
  for (const [allowed, cases] of [[true, valid], [false, denied]]) for (const request of cases) {
    assert.equal(helper.isReferencePinStatusRead(...request), allowed, 'reference-pin-policy');
    let routeHandler, fallback = 0, abort = 0, removed = 0, off = 0;
    const page = { on() {}, off() { off++; }, isClosed: () => false,
      evaluate: async fn => fn.toString().includes('.restore()') ? true : 0 };
    const context = { route: async (pattern, handler) => { assert.equal(pattern, 'http://127.0.0.1:3000/api/**'); routeHandler = handler; },
      addInitScript: async () => {}, unroute: async (pattern, handler) => {
        assert.equal(pattern, 'http://127.0.0.1:3000/api/**'); assert.equal(handler, routeHandler); removed++;
      } };
    const guard = await helper.silentGuard(page, context);
    try {
      // A guard with no allowed status route must not report a positive check.
      await assert.rejects(() => guard.check(), error => error.message.startsWith('reference-pin-status-route-allowed'));
      await routeHandler({ request: () => ({ url: () => request[0], method: () => request[1], postData: () => request[2] }),
        fallback: async () => { fallback++; }, abort: async reason => { assert.equal(reason, 'blockedbyclient'); abort++; } });
      assert.equal(fallback, allowed ? 1 : 0); assert.equal(abort, allowed ? 0 : 1);
      if (allowed) { await guard.check(); positives++; }
      else { await assert.rejects(() => guard.check(), error => error.message.startsWith('reference-no-disallowed-api-or-paid-call')); negatives++; }
    } finally { await guard.restore(); }
    assert.equal(removed, 1); assert.equal(off, 1);
  }
  assert.equal(positives, 3); assert.equal(negatives, 45);
  return { positives, negatives };
}
