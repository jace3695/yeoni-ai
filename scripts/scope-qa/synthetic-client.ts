// Synthetic browser lab only. Never imported by the application.
const key = 'scope-qa-synthetic-database';
const read = () => JSON.parse(localStorage.getItem(key) || '{"growth_routines":[],"growth_sessions":[]}');
const write = (db: unknown) => localStorage.setItem(key, JSON.stringify(db));
export const supabase = {
  storage: { from: () => ({
    upload: async () => ({ data: {}, error: null }),
    download: async (path: string) => {
      if (!localStorage.getItem('sequence-synthetic-workbook')) return { data: null, error: { status: 404, message: 'Synthetic fixture has no private workbook' } };
      if (path.endsWith('ready.txt')) return { data: new Blob(['synthetic']), error: null };
      const canvas=document.createElement('canvas');canvas.width=300;canvas.height=300;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,300,300);ctx.fillStyle='#aaa';ctx.font='24px sans-serif';ctx.fillText('합성 연습지',40,150);
      return { data: await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob!))), error: null };
    },
  }) },
  auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null }) },
  from(table: string) {
    let mode = 'select'; let payload: any; const filters: ((row: any) => boolean)[] = [];
    const execute = () => {
      if (mode !== 'select' && localStorage.getItem('scope-qa-fail-write')) { localStorage.removeItem('scope-qa-fail-write'); return {data:null,error:new Error('Synthetic write failure')}; }
      if (mode === 'select' && table === 'growth_routines' && localStorage.getItem('scope-qa-fail-read')) { localStorage.removeItem('scope-qa-fail-read'); return {data:null,error:new Error('Synthetic refresh failure')}; }

      if (table === 'user_app_state') return { data: [{ state: {} }], error: null };
      const db = read(); const rows = db[table] ?? []; let selected = rows.filter((row: any) => filters.every(fn => fn(row)));
      if (mode === 'insert' || mode === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        for (const item of list) {
          if (rows.some((row: any) => row.id === item.id)) return { data: null, error: new Error('duplicate') };
          const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...item }; rows.push(row); selected = [row];
        }
      }
      if (mode === 'update') selected.forEach((row: any) => Object.assign(row, payload));
      db[table] = rows; if (mode !== 'select') {
        write(db);
        if(localStorage.getItem('scope-qa-fail-refresh')) { localStorage.removeItem('scope-qa-fail-refresh');localStorage.setItem('scope-qa-fail-read','1'); }
      }
      return { data: selected, error: null };
    };
    const query: any = { range: () => query, contains: (key: string, values: Record<string, unknown>) => { filters.push(row => Object.entries(values).every(([k, v]) => row[key]?.[k] === v)); return query; }, select: () => query, order: () => query, abortSignal: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      gte: (key: string, value: string) => { filters.push(row => row[key] >= value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      insert: (value: unknown) => { mode='insert';payload=value;return query; },
      upsert: (value: unknown) => { mode='upsert';payload=value;return query; },
      update: (value: unknown) => { mode='update';payload=value;return query; },
      single: async () => { const result=execute();return { ...result,data:result.data?.[0] ?? null }; },
      maybeSingle: async () => { const result=execute();return { ...result,data:result.data?.[0] ?? null }; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve) };
    return query;
  },
};
export const authenticatedFetch = () => { throw new Error('External requests forbidden in synthetic lab'); };
export const getAuthHeaders = () => ({});
