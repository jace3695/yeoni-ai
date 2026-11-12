import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/components/AuthGate.tsx', import.meta.url), 'utf8');
const login = source.slice(source.indexOf('한 번 로그인하고'));
const footer = source.match(/<p className="([^"]+)">가계부·운동·언어 앱이 하나의 공통 계정을 사용합니다\.<\/p>/)?.[1] ?? '';

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
const contrast = (foreground: string, background: string) => (luminance(background) + 0.05) / (luminance(foreground) + 0.05);

test('login footer uses readable 14px text, line spacing and a dark neutral', () => {
  assert.match(footer, /\btext-sm\b/);
  assert.match(footer, /\bleading-6\b/);
  assert.match(footer, /\btext-gray-600\b/);
  assert.doesNotMatch(footer, /text-\[11px\]|text-gray-400/);
});

test('both login inputs give placeholders an explicit AA-contrast neutral', () => {
  assert.equal((login.match(/placeholder:text-gray-600/g) ?? []).length, 2);
  assert.equal((login.match(/font-normal text-gray-900/g) ?? []).length, 2);
  assert.ok(contrast('4b5563', 'f3f4f6') >= 4.5);
  assert.ok(contrast('4b5563', 'f3f4f6') >= 4.5);
});

test('login help is readable and password recovery remains a navigation action', () => {
  assert.match(source, /text-sm leading-6 text-gray-600">한 번 로그인하고/);
  assert.match(login, /min-h-11 w-full text-sm font-semibold text-gray-600 underline/);
  assert.match(source, /window\.location\.assign\("\/forgot-password"\)/);
  assert.match(source, /autoComplete=\{mode === "signIn" \? "current-password" : "new-password"\}/);
});


test('sign-up password policy remains visible outside the clipping input', () => {
  assert.match(source, /id="signup-password-hint" className="text-sm leading-6 text-gray-600">\{PASSWORD_POLICY_HINT\}/);
  assert.match(source, /aria-describedby=\{mode === "signUp" \? "signup-password-hint" : undefined\}/);
  assert.match(source, /placeholder=\{mode === "signUp" \? "새 비밀번호" : "비밀번호"\}/);
});
