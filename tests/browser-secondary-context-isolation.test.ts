import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function contextOptions(source: string) {
  const file = ts.createSourceFile('synthetic.ts', source, ts.ScriptTarget.Latest, true);
  const results: boolean[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'browser'
      && node.expression.name.text === 'newContext') {
      const options = node.arguments[0];
      // Dynamic options/spreads cannot establish an explicit, immutable policy.
      const properties = options && ts.isObjectLiteralExpression(options) ? options.properties : [];
      const policy = properties.filter(property => ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        && property.name.text === 'serviceWorkers');
      results.push(node.arguments.length === 1 && policy.length === 1
        && properties.every(property => ts.isPropertyAssignment(property)
          && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)))
        && ts.isPropertyAssignment(policy[0]) && ts.isStringLiteral(policy[0].initializer)
        && policy[0].initializer.text === 'block');
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return results;
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

function assertBlocked(results: boolean[]) {
  assert.ok(results.length > 0, 'Secondary context scan must not be empty');
  assert.ok(results.every(Boolean), 'Every direct secondary context must explicitly block service workers');
}

test('all direct secondary browser contexts explicitly block service workers', () => {
  const results = sources('tests/e2e').flatMap(contextOptions);
  assertBlocked(results);
  assert.ok(results.length >= 14, 'The reviewed secondary context coverage must remain present');
  // Intentional worker lifecycle coverage belongs to the primary fixture only.
  assert.ok(/test\.use\(\{ serviceWorkers: 'allow' \}\)/.test(readFileSync('tests/e2e/update.spec.ts', 'utf8')), 'Intentional service worker lifecycle exception must remain present');
});

test('missing and weakened secondary context policies are rejected in twenty mutations', () => {
  for (let index = 0; index < 10; index++) {
    const options = `viewport: { width: ${320 + index}, height: 844 }, timezoneId: 'Asia/Seoul'`;
    assertBlocked(contextOptions(`browser.newContext({ ${options}, serviceWorkers: 'block' });`));
    for (const policy of ['', ", serviceWorkers: 'allow'"]) {
      assert.throws(() => assertBlocked(contextOptions(`browser.newContext({ ${options}${policy} });`)));
    }
  }
});

test('empty scans, missing options and dynamic overrides cannot pass', () => {
  assert.throws(() => assertBlocked(contextOptions('// browser.newContext is not a call')));
  for (const options of ['', 'options', "{ serviceWorkers: 'block', ...options }",
    "{ serviceWorkers: 'block', serviceWorkers: 'allow' }", "{ serviceWorkers: 'block', [key]: value }"]) {
    assert.throws(() => assertBlocked(contextOptions(`browser.newContext(${options});`)));
  }
});
