import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { dispatchSandboxSubmit } from '../scripts/growth-preview/form-submit.ts';

test('QA bridge validates then sends only a bubbling cancelable submit event', () => {
  const events: Event[] = [];
  let checks = 0;
  assert.equal(dispatchSandboxSubmit({ reportValidity: () => { checks++; return true; }, dispatchEvent: event => { events.push(event); return false; } }), true);
  assert.equal(checks, 1); assert.equal(events.length, 1);
  assert.equal(events[0].type, 'submit'); assert.equal(events[0].bubbles, true); assert.equal(events[0].cancelable, true);
});

test('QA bridge never dispatches invalid form data', () => {
  assert.equal(dispatchSandboxSubmit({ reportValidity: () => false, dispatchEvent: () => { throw new Error('Must not submit'); } }), false);
});

test('QA capture bridge limits submit to valid submit clicks and non-IME text Enter', async () => {
  const output = await build({ entryPoints: ['scripts/growth-preview/form-bridge.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
  class FakeElement {
    private button: unknown;
    constructor(button: unknown = null) { this.button = button; }
    closest() { return this.button; }
  }
  class FakeInput extends FakeElement {
    type: string; form: unknown; disabled: boolean;
    constructor(type: string, form: unknown, disabled = false) { super(); this.type = type; this.form = form; this.disabled = disabled; }
  }
  const compiledModule: { exports: { default?: (props: { children: null }) => { props: {
    onClickCapture(event: unknown): void; onKeyDownCapture(event: unknown): void;
  } } } } = { exports: {} };
  vm.runInNewContext(output.outputFiles[0].text, { module: compiledModule, exports: compiledModule.exports,
    require: createRequire(import.meta.url), Element: FakeElement, HTMLInputElement: FakeInput, Event });
  assert.ok(compiledModule.exports.default);
  const props = compiledModule.exports.default({ children: null }).props;
  let checks = 0, submits = 0, prevented = 0, valid = true;
  const form = { reportValidity() { checks++; return valid; }, dispatchEvent(event: Event) {
    assert.equal(event.type, 'submit'); assert.equal(event.bubbles, true); assert.equal(event.cancelable, true);
    submits++; return false;
  } };
  const click = (button: unknown) => props.onClickCapture({ target: new FakeElement(button), preventDefault() { prevented++; } });
  click({ type: 'submit', disabled: false, form }); assert.equal(submits, 1);
  for (const button of [{ type: 'button', form }, { type: 'reset', form }, { type: 'submit', disabled: true, form },
    { type: 'submit', form: null }, null]) click(button);
  assert.equal(submits, 1);
  valid = false; click({ type: 'submit', form }); assert.equal(submits, 1); valid = true;
  const key = (key: string, type: string, isComposing = false, disabled = false) => props.onKeyDownCapture({
    key, target: new FakeInput(type, form, disabled), nativeEvent: { isComposing }, preventDefault() { prevented++; },
  });
  key('Enter', 'text'); assert.equal(submits, 2);
  key('Enter', 'text', true); key('Enter', 'text', false, true); key('Enter', 'checkbox'); key('Escape', 'text');
  assert.equal(submits, 2); assert.equal(checks, 3); assert.equal(prevented, 3);
});
