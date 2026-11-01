# Local synthetic scope browser check

Run from the repository root after `npm ci`, `npm --prefix scripts/browser-qa ci`, and `npm run build`:

```sh
node scripts/scope-qa/server.mjs
node scripts/scope-qa/check.mjs
```

The loopback server on port 8873 bundles the actual GrowthPage/useGrowthData and
Japanese page components. Supabase is replaced only in this standalone bundle
with an owner-scoped synthetic localStorage client. Next Link/Image/navigation
are small lab adapters; the production app does not import these files.
SpeechSynthesis is synthetic, with Japanese voice selection and microphone
requests observed. The script uses the environment's `/usr/bin/chromium`.

Results and screenshots go to `/tmp/yeoni-scope-evidence`. Requests outside the
loopback origin are blocked. No credentials, hosted account, live database,
external provider, or microphone is used. Synthetic storage is private to the
new disposable browser context, which is closed after testing.

This proves component interactions, not authenticated Next routing, real RLS,
physical iPhone behavior, or audible Japanese pronunciation quality. The normal
isolated E2E suite requires its separate disposable Supabase setup.
