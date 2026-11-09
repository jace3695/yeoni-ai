import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? join(root, '../evidence/browser-storage-harness'));
mkdirSync(output, { recursive: true });
const source = readFileSync(join(root, 'app/data/languageStorageLock.ts'), 'utf8');
// Only the two lock identities differ. The production gate logic is unchanged.
// This harness never touches production DB or localStorage record keys.
const isolated = source.replace("'yeoni-language-records-v1'", "'yeoni-compat-synthetic-lock-v1'")
  .replace("'yeoni-language-serialization-v1'", "'yeoni-compat-synthetic-db-v1'");
if (source === isolated) throw new Error('Could not isolate the gate names');
const compiled = ts.transpileModule(isolated, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
writeFileSync(join(output, 'languageStorageLock.js'), compiled);
for (const name of ['index.html', 'worker.html', 'controller.js', 'worker.js']) copyFileSync(join(here, name), join(output, name));
const hashes = { productionSourceSha256: createHash('sha256').update(source).digest('hex'), isolatedModuleSha256: createHash('sha256').update(compiled).digest('hex'), purpose: 'Synthetic browser gate test only; not real account, full app, cloud, crash durability, or legacy-writer verification.' };
writeFileSync(join(output, 'source-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
console.log(JSON.stringify({ output, ...hashes }, null, 2));
