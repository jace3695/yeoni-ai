import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

test('actual host suppression leases clear speech, survive account boundaries and restore without stale controls', () => {
  type Slot = { value?: any; deps?: unknown[]; cleanup?: () => void };
  const slots: Slot[] = []; let cursor = 0, dirty = false, stops = 0;
  let pending: Array<() => void> = []; const events: string[] = [];
  const next = () => slots[cursor++] ?? (slots[cursor - 1] = {});
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const memo = (factory: () => any, deps: unknown[]) => { const s = next(); if (changed(s.deps, deps)) { s.value = factory(); s.deps = deps; } return s.value; };
  const react = { ...React,
    useState(initial: any) { const s = next(); if (!('value' in s)) s.value = typeof initial === 'function' ? initial() : initial; return [s.value, (value: any) => { const nextValue = typeof value === 'function' ? value(s.value) : value; if (!Object.is(s.value, nextValue)) { s.value = nextValue; dirty = true; } }]; },
    useRef(initial: any) { const s = next(); return s.value ?? (s.value = { current: initial }); },
    useMemo: memo, useCallback: (fn: any, deps: unknown[]) => memo(() => fn, deps),
    useLayoutEffect(effect: () => void | (() => void), deps: unknown[]) { const s = next(); if (changed(s.deps, deps)) { s.deps = deps; pending.push(() => { s.cleanup?.(); s.cleanup = effect() || undefined; }); } },
    useEffect() { next(); },
  };
  const deps: Record<string, unknown> = {
    react, 'react/jsx-runtime': jsx, 'react-dom': { createPortal: (child: unknown) => child },
    '@/lib/yeoni/character-controller': { EMPTY_PLAYBACK: { mode: 'idle' } },
    '@/lib/yeoni/common-host-policy': { isQuietCharacterRoute: () => false },
    '@/lib/yeoni/speech-focus': { stopAllSpeech: () => { stops++; } },
    '../useYeoniPreferences': { useYeoniPreferences: () => ({ visible: true }) },
    './SwitchableCharacterStage': { default: 'test-stage' },
    './common-character-host.module.css': { default: { host: 'host', portrait: 'portrait' } },
    './CommonCharacterContext': { CHARACTER_RESET_EVENT: 'reset', CommonCharacterContext: { Provider: 'channel' }, CommonCharacterPlacementContext: { Provider: 'placement' }, CommonCharacterSuppressionContext: { Provider: 'suppression' } },
  };
  const exports = { default: undefined as unknown as (props: any) => any };
  const source = readFileSync(new URL('../components/yeoni/CommonCharacterHost.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, Event, window: { dispatchEvent: (e: Event) => events.push(e.type) }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const render = (boundary = 0) => { let output; let attempts = 0; do { dirty = false; cursor = 0; pending = []; output = exports.default({ path: '/budget', boundary, children: null }); pending.forEach(f => f()); assert.ok(++attempts < 10); } while (dirty); return output; };
  const find = (node: any, type: string): any => { if (!node) return null; if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean) ?? null; return node.type === type ? node : find(node.props?.children, type); };
  let tree = render(); assert.ok(find(tree, 'test-stage'));
  find(tree, 'channel').props.value.publish({ emotion: 'happy' }); tree = render();
  const suppress = find(tree, 'suppression').props.value;
  const stopBefore = stops; const releaseA = suppress(); tree = render(); assert.equal(find(tree, 'aside'), null); assert.ok(stops > stopBefore);
  const releaseB = suppress(); releaseA(); tree = render(1); assert.equal(find(tree, 'aside'), null, 'another lease and changed account boundary remain suppressed');
  assert.equal(find(tree, 'suppression').props.value, suppress, 'lease callback stays stable');
  releaseB(); tree = render(1); const stage = find(tree, 'test-stage'); assert.ok(stage); assert.equal(stage.props.emotion, undefined); assert.equal(stage.props.speech().manifest, null);
  const releaseReplay = suppress(); releaseReplay(); const releaseActive = suppress(); tree = render(1); assert.equal(find(tree, 'aside'), null, 'effect setup/cleanup replay leaves one active lease');
  releaseActive(); tree = render(1); assert.ok(find(tree, 'test-stage')); assert.ok(events.length >= 4);
  const beforeUnmount = stops; slots.forEach(s => s.cleanup?.()); assert.ok(stops > beforeUnmount);
});
