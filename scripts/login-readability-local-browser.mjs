// Real AuthGate component and production CSS; synthetic signed-out auth only.
// No .env reads, hosted account, personal records, email delivery or provider.
import { build } from './browser-qa/node_modules/esbuild/lib/main.js';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const out = resolve('scripts/browser-qa/.generated/login-readability');
mkdirSync(out, { recursive: true });
const auth = `export const isSupabaseConfigured=true, isPasswordRecoveryRedirect=false;
export const supabase={auth:{async getUser(){return{data:{user:null}}},onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},
async signInWithPassword(){window.qa.calls++;return{error:{message:'가상 로그인 오류 안내입니다.'}}},
async signUp(){window.qa.calls++;return{error:null,data:{session:null}}}}};`;
const noData = `export const prepareLocalCloudState=()=>{},clearLanguageLocalState=()=>{};`;
const pin = `export const hasDevicePin=async()=>false,isPinSessionUnlocked=()=>false,MAX_PIN_FAILURES=5,PIN_LENGTH=6,
reauthenticateDevicePin=()=>{},unlockPinSession=()=>{},verifyDevicePin=()=>{},hasDeviceBiometric=()=>false,removeDeviceBiometric=()=>{},verifyDeviceBiometric=()=>{};`;
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import AuthGate from './app/components/AuthGate';
window.qa={calls:0};createRoot(document.getElementById('root')).render(<AuthGate><p>Protected child must remain hidden</p></AuthGate>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-auth-boundary', setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onResolve({ filter: /(^|\/)(cloudSync|languageCloudSync)$/ }, () => ({ path: 'data', namespace: 'fixture' }));
    b.onResolve({ filter: /(^|\/)(devicePin|deviceBiometric)$/ }, () => ({ path: 'pin', namespace: 'fixture' }));
    b.onResolve({ filter: /(^|\/)(AppIdentity|HubBottomNav)$/ }, () => ({ path: 'unused-authenticated-ui', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'auth' ? auth : path === 'data' ? noData : path === 'pin' ? pin : 'export function AppIcon(){return null};export default function Nav(){return null}', loader: 'js' }));
  } }] });
const css = (await postcss([tailwindcss({ config: resolve('tailwind.config.ts'), content: ['./app/components/AuthGate.tsx'] })])
  .process(readFileSync('app/globals.css', 'utf8'), { from: undefined })).css;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : 'text/html;charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/forgot-password'
    ? '<!doctype html><html lang="ko"><h1>합성 비밀번호 복구 경로</h1><p>이메일 발송 없음</p></html>'
    : `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/app.js"></script></html>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.QA_CHROMIUM_PATH ? { executablePath: process.env.QA_CHROMIUM_PATH, headless: true } : { headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', serviceWorkers: 'block' });
const blocked = [], errors = [], passed = [], measurements = [];
await context.route('**/*', r => r.request().url().startsWith(base + '/') ? r.continue() : (blocked.push(r.request().url()), r.abort()));
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
const heading = page.getByRole('heading', { name: 'AI 연이', exact: true });
const footer = page.getByText('가계부·운동·언어 앱이 하나의 공통 계정을 사용합니다.', { exact: true });
const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
async function measure(locator, pseudo = null) {
  return locator.evaluate((element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    const luminance = color => {
      const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => x / 255)
        .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    // The login card is white/95 over a very light gradient. #F3F4F6 is a
    // deliberately darker conservative bound, also the inactive tab surface.
    const contrast = (luminance('rgb(243,244,246)') + .05) / (luminance(style.color) + .05);
    return { color: style.color, fontSize: style.fontSize, lineHeight: style.lineHeight, opacity: style.opacity, conservativeContrast: contrast };
  }, pseudo);
}
let failure = null;
try {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base); await expect(heading).toBeVisible();
    await expect(footer).toBeVisible(); await noOverflow();
    for (const [name, locator, pseudo] of [
      ['description', page.getByText('한 번 로그인하고 나의 모든 앱을 안전하게 사용하세요.'), null],
      ['footer', footer, null],
      ['email placeholder', page.getByLabel('이메일', { exact: true }), '::placeholder'],
      ['password placeholder', page.getByLabel('비밀번호', { exact: true }), '::placeholder'],
      ['inactive tab', page.getByRole('button', { name: '계정 만들기', exact: true }), null],
      ['recovery link', page.getByRole('button', { name: '비밀번호를 잊으셨나요?', exact: true }), null],
    ]) {
      const result = await measure(locator, pseudo); measurements.push({ width, name, ...result });
      assert.ok(result.conservativeContrast >= 4.5, `${width} ${name}: ${result.conservativeContrast}`);
      assert.ok(parseFloat(result.fontSize) >= 14, `${width} ${name} font size`);
      assert.equal(result.opacity, '1');
    }
    await page.screenshot({ path: out + `/login-${width}.png`, fullPage: true });
    passed.push(`${width}px login readable at >=4.5:1, >=14px; no horizontal overflow`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  await expect(footer).toBeVisible(); await noOverflow();
  await page.screenshot({ path: out + '/login-320-text-200.png', fullPage: true });
  passed.push('320px with 200% root text size reflows with no horizontal overflow');
  await page.reload(); await expect(heading).toBeVisible();
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.locator('#signup-password-hint')).toHaveText('8자 이상 · 영문 대문자·소문자·숫자·특수문자 포함');
    await expect(page.locator('#signup-password-hint')).toBeVisible();
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('aria-describedby', 'signup-password-hint');
    await expect(page.getByRole('button', { name: '비밀번호를 잊으셨나요?' })).toHaveCount(0);
    await noOverflow();
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
  }
  assert.equal(await page.evaluate(() => window.qa.calls), 0);
  passed.push('repeated sign-in/sign-up switching preserves hints and makes no auth call');
  await page.getByRole('button', { name: 'AI 연이 시작', exact: true }).click();
  assert.equal(await page.evaluate(() => window.qa.calls), 0);
  await page.getByLabel('이메일', { exact: true }).fill('fictional@example.invalid');
  await page.getByLabel('비밀번호', { exact: true }).fill('SyntheticOnly123!');
  await page.getByRole('button', { name: 'AI 연이 시작', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('가상 로그인 오류 안내입니다.');
  await expect(page.getByRole('button', { name: 'AI 연이 시작', exact: true })).toBeEnabled();
  await noOverflow();
  await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  passed.push('native empty-field validation and synthetic login error remain usable; mode switch clears error');
  await page.getByRole('button', { name: '비밀번호를 잊으셨나요?', exact: true }).click();
  await expect(page).toHaveURL(base + '/forgot-password');
  await page.goBack(); await expect(heading).toBeVisible();
  await page.goForward(); await expect(page).toHaveURL(base + '/forgot-password');
  await page.goBack(); await page.reload(); await expect(heading).toBeVisible();
  await expect(footer).toBeVisible(); await expect(page.getByText('Protected child must remain hidden')).toHaveCount(0);
  passed.push('recovery navigation, Back/Forward and reload retain the signed-out gate; no recovery email sent');
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
} catch (error) { failure = String(error); throw error; }
finally {
  writeFileSync(out + '/result.json', JSON.stringify({ passed, measurements, errors, blocked, failure,
    scope: 'Actual AuthGate and production CSS in Chromium with synthetic signed-out auth. Not hosted login, recovery delivery, authenticated records, Windows-device or full-app certification.' }, null, 2));
  console.log(JSON.stringify({ passed, failure, errors, blocked }, null, 2));
  await browser.close(); await new Promise(r => server.close(r));
}
