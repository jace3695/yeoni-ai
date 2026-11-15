import type { SupabaseClient } from '@supabase/supabase-js';
import type { GrowthResourceRow } from '../app/data/growthPlatform.ts';

type JournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type UploadRow = Pick<GrowthResourceRow, 'id' | 'user_id' | 'routine_id' | 'title' | 'category' | 'storage_path' | 'mime_type' | 'size_bytes' | 'classification' | 'notes'>;
export type ResourceUploadInput = Omit<UploadRow, 'id' | 'user_id' | 'storage_path' | 'size_bytes'>;
export type PendingResourceUpload = { version: 1; owner: string; sha256: string; row: UploadRow };
export const pendingResourceUploadKey = (owner: string) => `ai-yeoni-resource-upload-v1:${owner}`;
export const RESOURCE_UPLOAD_UNCERTAIN = '저장 결과가 아직 확인되지 않았어요. 파일을 자동 삭제하지 않았어요. 같은 요청의 결과를 확인해 주세요.';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mimeTypes = new Set(['application/pdf', 'text/plain', 'text/markdown', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

export function readPendingResourceUpload(storage: JournalStorage, owner: string): PendingResourceUpload | null {
  const raw = storage.getItem(pendingResourceUploadKey(owner));
  if (raw === null) return null;
  try {
    const item = JSON.parse(raw) as PendingResourceUpload;
    const row = item.row;
    if (item.version !== 1 || item.owner !== owner || !uuid.test(owner) || !row || row.user_id !== owner
      || !uuid.test(row.id) || !/^[a-f0-9]{64}$/.test(item.sha256)
      || typeof row.storage_path !== 'string' || !new RegExp(`^${owner}/resource-${row.id}(\\.[a-z0-9]{1,10})?$`).test(row.storage_path)
      || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 120
      || row.routine_id !== null && !uuid.test(row.routine_id)
      || !['development', 'typing', 'handwriting', 'custom', 'reference'].includes(row.category)
      || !mimeTypes.has(row.mime_type) || !Number.isInteger(row.size_bytes) || row.size_bytes < 1 || row.size_bytes > 10_485_760
      || !['direct', 'partial', 'reference', 'duplicate', 'deferred'].includes(row.classification)
      || typeof row.notes !== 'string' || row.notes.length > 500) throw new Error('invalid');
    // Do not pass any unvalidated extra fields to the database.
    if (Object.keys(row).sort().join(',') !== 'category,classification,id,mime_type,notes,routine_id,size_bytes,storage_path,title,user_id') throw new Error('invalid');
    return item;
  } catch { throw new Error('이 탭의 미확인 업로드 정보를 읽지 못했어요. 새 자료를 추가하지 말고 기존 자료 목록을 확인해 주세요.'); }
}

async function digest(blob: Blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function bounded<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(RESOURCE_UPLOAD_UNCERTAIN)), 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

// No automatic cleanup: a transport error does not prove that an insert or
// upload failed. Only an explicit retry may recreate missing data, using the
// original ID/path. A check alone performs no remote writes.
export async function saveResourceUpload(client: SupabaseClient, owner: string, storage: JournalStorage,
  options: { input?: ResourceUploadInput; file?: File | null; retryMissing?: boolean }, check: () => void = () => {}) {
  check();
  let pending = readPendingResourceUpload(storage, owner);
  if (pending && options.input) throw new Error(RESOURCE_UPLOAD_UNCERTAIN);
  if (!pending && !options.input) throw new Error('확인할 업로드 요청이 없어요. 자료 목록을 새로 불러와 주세요.');
  const auth = await bounded(client.auth.getUser());
  check();
  if (auth.error || auth.data.user?.id !== owner) throw new Error('계정이 변경됐어요. 현재 계정에서 다시 확인해 주세요.');
  const isNew = !pending;
  if (!pending) {
    const file = options.file;
    const input = options.input!;
    if (!file || file.size < 1 || file.size > 10_485_760 || !mimeTypes.has(input.mime_type)) throw new Error('지원되는 10MB 이하의 빈 파일이 아닌 자료를 선택해 주세요.');
    const id = crypto.randomUUID();
    const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : '';
    pending = { version: 1, owner, sha256: await digest(file), row: {
      id, user_id: owner, routine_id: input.routine_id, title: input.title.trim().slice(0, 120), category: input.category,
      storage_path: `${owner}/resource-${id}${extension ? `.${extension}` : ''}`, mime_type: input.mime_type,
      size_bytes: file.size, classification: input.classification, notes: input.notes.trim().slice(0, 500),
    } };
    check();
    const raw = JSON.stringify(pending);
    // Validate before committing the journal or sending any writes.
    readPendingResourceUpload({ getItem: () => raw, setItem() {}, removeItem() {} }, owner);
    storage.setItem(pendingResourceUploadKey(owner), raw);
    if (storage.getItem(pendingResourceUploadKey(owner)) !== raw) throw new Error('재시도 정보를 보관하지 못해 파일을 전송하지 않았어요.');
  }
  const request = pending;
  const snapshot = JSON.stringify(request);
  const unchanged = () => {
    check();
    if (JSON.stringify(readPendingResourceUpload(storage, owner)) !== snapshot) throw new Error('업로드 요청이 바뀌어 이전 요청을 중단했어요.');
  };
  const read = async () => {
    unchanged();
    const result = await client.from('growth_resources').select('*').eq('user_id', owner).eq('id', request.row.id).abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
    unchanged();
    if (result.error) throw new Error(RESOURCE_UPLOAD_UNCERTAIN);
    const row = result.data as GrowthResourceRow | null;
    if (row && (row.id !== request.row.id || row.user_id !== owner || row.storage_path !== request.row.storage_path
      || row.size_bytes !== request.row.size_bytes || row.mime_type !== request.row.mime_type)) throw new Error('저장된 자료의 파일 정보가 달라요. 덮어쓰거나 삭제하지 않았어요.');
    return row;
  };
  const bucket = client.storage.from('growth-resources');
  const verifyFile = async () => {
    unchanged();
    // Reconciliation needs the current object, not a cached old file or 404.
    const result = await bounded(bucket.download(request.row.storage_path, {}, { cache: 'no-store' }));
    unchanged();
    if (result.error) {
      // Storage can report HTTP 400 with its underlying statusCode "404".
      if ('statusCode' in result.error && String(result.error.statusCode) === '404') return false;
      throw new Error(RESOURCE_UPLOAD_UNCERTAIN);
    }
    if (!result.data || result.data.size !== request.row.size_bytes || result.data.type.split(';')[0].trim().toLowerCase() !== request.row.mime_type
      || await digest(result.data) !== request.sha256) throw new Error('보관된 파일이 원본과 일치하지 않아요. 덮어쓰거나 삭제하지 않았어요.');
    unchanged();
    return true;
  };
  const upload = async () => {
    const file = options.file;
    if (!file || file.size !== request.row.size_bytes || await digest(file) !== request.sha256) throw new Error('처음 선택한 원본 파일을 다시 선택해 주세요. 내용이 다른 파일은 전송하지 않아요.');
    unchanged();
    // Storage's multipart Blob/File path takes the part MIME from the body,
    // not contentType. Preserve exact bytes while applying the validated MIME
    // even when the file picker supplies an empty type (e.g. .txt/.md).
    const body = new Blob([file], { type: request.row.mime_type });
    try { await bounded(bucket.upload(request.row.storage_path, body, { contentType: request.row.mime_type, upsert: false })); }
    catch { /* A request may commit even if its response was lost. */ }
    unchanged();
    if (!await verifyFile()) throw new Error(RESOURCE_UPLOAD_UNCERTAIN);
  };
  let row = await read();
  if (isNew) await upload();
  else {
    // Missing metadata is not proof of non-commit or permission to recreate a
    // record another tab may have intentionally deleted.
    if (!row && !options.retryMissing) throw new Error(RESOURCE_UPLOAD_UNCERTAIN);
    if (!await verifyFile()) {
      if (!options.retryMissing) throw new Error('파일을 확인하지 못했어요. 자동 복구·삭제하지 않았어요. 다른 곳에서 삭제했는지 먼저 확인해 주세요.');
      await upload();
    }
  }
  if (!row) {
    unchanged();
    try { await client.from('growth_resources').insert(request.row).select('*').abortSignal(AbortSignal.timeout(15_000)).single(); }
    catch { /* Keep the same ID/path and verify, never delete the file. */ }
    unchanged();
    row = await read();
  }
  if (!row) throw new Error(RESOURCE_UPLOAD_UNCERTAIN);
  unchanged();
  storage.removeItem(pendingResourceUploadKey(owner));
  if (storage.getItem(pendingResourceUploadKey(owner)) !== null) throw new Error('저장은 확인했지만 재시도 표시를 정리하지 못했어요. 같은 요청을 다시 확인해 주세요.');
  // Later title/classification/usage edits are authoritative; do not overwrite.
  return row;
}
