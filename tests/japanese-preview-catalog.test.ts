import { JAPANESE_COURSE_GAP_CHUNKS } from '../data/japaneseCourseGapChunks.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFile } from 'node:fs/promises';
import { CURRICULUM } from '../data/curriculum.ts';
import { JAPANESE_CHUNK_LESSONS } from '../data/japaneseChunkLessons.ts';
import { getJapaneseReadingLesson } from '../data/japaneseReadingLessons.ts';
import { getQuestionChoices, getSessionQuizIndices } from '../utils/learningSession.ts';
import { PREVIEW_CURRICULUM_CATALOG, PREVIEW_READING_CATALOG, PREVIEW_CHUNK_CATALOG, previewTrack } from '../scripts/japanese-preview/catalog.ts';
import { previewHash, readPreviewLocation } from '../scripts/japanese-preview/navigation.ts';

const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`);

test('preview catalog is an exact one-to-one view of all 62 curriculum, 26 reading and 88 non-grammar chunk IDs', () => {
  const curriculumIds = [...numbered('f', 20), ...numbered('w', 22), ...numbered('t', 20)];
  const readingIds = [...numbered('middle-', 8), ...numbered('middle-core-', 3), ...numbered('upper-', 6), ...numbered('upper-mech-', 6), ...numbered('upper-core-', 3)];
  assert.deepEqual(PREVIEW_CURRICULUM_CATALOG.map(item => item.id), curriculumIds);
  assert.deepEqual(PREVIEW_READING_CATALOG.map(item => item.id), readingIds);
  assert.equal(PREVIEW_CHUNK_CATALOG.length, 88);
  assert.deepEqual(new Set(PREVIEW_CURRICULUM_CATALOG.map(item => item.id)), new Set(CURRICULUM.map(item => item.id)));
  assert.deepEqual(new Set(PREVIEW_CHUNK_CATALOG.map(item => item.id)), new Set([...curriculumIds, ...readingIds]));
  assert.deepEqual(PREVIEW_CHUNK_CATALOG.map(item => item.id), [...JAPANESE_CHUNK_LESSONS, ...JAPANESE_COURSE_GAP_CHUNKS].map(item => item.lessonId));
  for (const entries of [PREVIEW_CURRICULUM_CATALOG, PREVIEW_READING_CATALOG, PREVIEW_CHUNK_CATALOG]) assert.equal(new Set(entries.map(item => item.id)).size, entries.length);
});

test('every catalog link resolves to its exact existing component data without granting a normal navigation', () => {
  for (const item of PREVIEW_CURRICULUM_CATALOG) {
    const route = readPreviewLocation(item.href);
    assert.equal(route.pathname, '/language/learn'); assert.equal(route.query.get('lesson'), item.id);
    assert.equal(CURRICULUM.find(lesson => lesson.id === item.id)?.title, item.title);
  }
  for (const item of PREVIEW_READING_CATALOG) {
    const route = readPreviewLocation(item.href);
    assert.equal(route.pathname, '/language/levels'); assert.equal(route.query.get('lesson'), item.id);
    assert.equal(getJapaneseReadingLesson(item.id)?.title, item.title);
  }
  for (const item of PREVIEW_CHUNK_CATALOG) {
    const route = readPreviewLocation(item.href);
    assert.equal(route.pathname, '/language/qa-chunks'); assert.equal(route.query.get('lesson'), item.id);
    assert.equal([...JAPANESE_CHUNK_LESSONS, ...JAPANESE_COURSE_GAP_CHUNKS].find(lesson => lesson.lessonId === item.id)?.expression, item.expression);
  }
  for (const item of [...PREVIEW_CURRICULUM_CATALOG, ...PREVIEW_READING_CATALOG, ...PREVIEW_CHUNK_CATALOG]) assert.equal(previewHash(item.href.slice(1)), item.href);
  assert.equal(previewTrack('work'), 'work'); assert.equal(previewTrack('travel'), 'travel');
  assert.equal(previewTrack(null), undefined); assert.equal(previewTrack('__proto__'), undefined);
});

test('the real compiled catalog provides every ID in both native selectors and safe links', async () => {
  const built = await build({ entryPoints: ['scripts/japanese-preview/PreviewCatalog.tsx'], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
  const cjsModule = { exports: {} as { default: (props: { track?: string }) => React.ReactNode } };
  new Script(built.outputFiles[0].text).runInNewContext({ module: cjsModule, exports: cjsModule.exports, require: createRequire(import.meta.url), URLSearchParams });
  const html = renderToStaticMarkup(createElement(cjsModule.exports.default, {}));
  for (const item of [...PREVIEW_CURRICULUM_CATALOG, ...PREVIEW_READING_CATALOG, ...PREVIEW_CHUNK_CATALOG]) {
    assert.ok(html.includes(`href="${item.href}"`), item.href);
    assert.ok(html.includes(`value="${item.href}"`), item.href);
  }
  assert.equal((html.match(/<select/g) ?? []).length, 3);
  assert.equal((html.match(/<option value="#/g) ?? []).length, 176);
  assert.doesNotMatch(html, /href="(?!#)|<form|<input|<textarea|<img|<iframe/);
  const workOnly = renderToStaticMarkup(createElement(cjsModule.exports.default, { track: 'work' }));
  assert.ok(workOnly.includes('href="#/language/learn?lesson=w22"'));
  assert.ok(!workOnly.includes('href="#/language/learn?lesson=t01"'));
  assert.ok(workOnly.includes('href="#/language/qa-chunks?lesson=t01"'));
});

test('all curriculum checks remain choice-based and fixture adds no removed practice routes', async () => {
  for (const lesson of CURRICULUM) {
    assert.ok(lesson.words.length > 0);
    for (const minutes of [5, 10, 20] as const) {
      const indices = getSessionQuizIndices(lesson, minutes);
      assert.ok(indices.length > 0);
      for (const index of indices) for (const mode of ['starter', 'reader'] as const) {
        const choices = getQuestionChoices(lesson, index, mode);
        assert.ok(choices.length >= 2, `${lesson.id}:${index}:${mode}`);
        assert.equal(choices.filter(choice => choice.correct).length, 1, `${lesson.id}:${index}:${mode}`);
      }
    }
  }
  const entry = await readFile(new URL('../scripts/japanese-preview/entry.tsx', import.meta.url), 'utf8');
  assert.match(entry, /<LearnPage \/>/);
  const learn = await readFile(new URL('../app/language/learn/page.tsx', import.meta.url), 'utf8');
  assert.match(learn, /<FocusedLesson key=/);
  assert.match(entry, /<JapaneseChunkPractice lesson=\{chunk\}/);
  assert.match(learn, /getLessonStudyLevel\(lesson\.id\) === requestedLevel/);
  assert.doesNotMatch(entry, /PracticeWorkspace|Recorder|FreeConversationPractice|GrammarWritingPractice|WorkWritingPractice/);
  for (const href of ['/language/practice', '/language/conversation', '/language/writing', '/language/kana-writing', '/settings']) assert.equal(previewHash(href), '#/unsupported');
});
