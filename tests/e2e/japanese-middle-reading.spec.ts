import { test } from './fixture';
import { verifyReadingLessons } from './japanese-reading-flow';
test('all 18 new intermediate reading answers and three completion stamps persist through real UI, reload and relogin', async ({ page, qa }) => {
  await verifyReadingLessons(page, qa, 'intermediate', {
    setup: async action => { await test.step('reading setup', action); },
    lessons: [
      async action => { await test.step('reading lesson 1', action); },
      async action => { await test.step('reading lesson 2', action); },
      async action => { await test.step('reading lesson 3', action); },
    ],
    repeat: async action => { await test.step('reading immediate repeat', action); },
    restoration: async action => { await test.step('reading restoration', action); },
  });
});
