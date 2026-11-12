import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function renderGuide({ host, visible, textOnly }: { host: boolean; visible: boolean; textOnly?: boolean }) {
  const exports = { default: undefined as unknown as React.ComponentType<{ embedded: boolean; textOnly?: boolean; children?: string }> };
  const dependencies: Record<string, unknown> = {
    react: React,
    'react/jsx-runtime': jsx,
    './YeoniMascot': { default: () => React.createElement('i', { 'data-test-legacy-mascot': true }) },
    './useYeoniPreferences': { useYeoniPreferences: () => ({ visible }) },
    './yeoni/CommonCharacterContext': { useCommonCharacterHost: () => host ? {} : null },
    './app-companion.module.css': { default: { guide: 'guide', bubble: 'bubble', name: 'name' } },
  };
  const source = readFileSync(new URL('../components/AppCompanion.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return renderToStaticMarkup(React.createElement(exports.default, { embedded: true, textOnly }, '합성 안내'));
}

for (const host of [false, true]) {
  test(`text-only guidance keeps text without adding a legacy portrait (common host=${host})`, () => {
    for (const visible of [false, true]) {
      const html = renderGuide({ host, visible, textOnly: true });
      assert.match(html, /합성 안내/);
      assert.match(html, /aria-label="연이의 안내"/);
      assert.match(html, /data-character="false"/);
      assert.doesNotMatch(html, /data-test-legacy-mascot/);
    }
  });
}

test('existing guidance keeps its legacy portrait when no common host is available', () => {
  const html = renderGuide({ host: false, visible: true });
  assert.match(html, /data-character="true"/);
  assert.match(html, /data-test-legacy-mascot/);
});
