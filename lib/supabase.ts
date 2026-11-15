import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.ts'
import { getDevSyncQaTrace } from './syncQaTrace.ts'
import { createBoundaryFetch } from './speech-boundary-transport.ts'
import { assertStorageOwnership } from '../app/data/storageOwnership.ts'

let browserClient: SupabaseClient | null = null

export function createClient() {
  if (typeof window !== 'undefined') assertStorageOwnership()
  if (!browserClient) {
    const trace = process.env.NODE_ENV === 'development' ? getDevSyncQaTrace(SUPABASE_URL) : null
    browserClient = createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: createBoundaryFetch(trace?.fetch ?? ((...args) => fetch(...args)), SUPABASE_URL) },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        experimental: { passkey: true },
      }
    })
  }

  return browserClient
}

export type AuthenticatedFetchBoundary = {
  ownerId: string
  isCurrent: () => boolean
}

export class AuthenticatedFetchBoundaryError extends Error {
  constructor() {
    super('요청 계정이 바뀌었거나 인증을 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.')
    this.name = 'AuthenticatedFetchBoundaryError'
  }
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}, boundary?: AuthenticatedFetchBoundary) {
  const assertCurrent = () => {
    if (!boundary) return
    let current = false
    try { current = typeof boundary.ownerId === 'string' && boundary.ownerId.trim().length > 0 && boundary.isCurrent() && !init.signal?.aborted } catch { /* fail closed */ }
    if (!current) throw new AuthenticatedFetchBoundaryError()
  }
  assertCurrent()
  const auth = await (async () => {
    try { return await createClient().auth.getSession() }
    catch (error) { if (boundary) throw new AuthenticatedFetchBoundaryError(); throw error }
  })()
  assertCurrent()
  if (boundary && !auth?.data) throw new AuthenticatedFetchBoundaryError()
  const session = auth.data.session
  if (boundary && (auth.error || session?.user?.id !== boundary.ownerId
    || typeof session?.access_token !== 'string' || !/^\S+$/.test(session.access_token)
    || (session.expires_at !== undefined && (!Number.isFinite(session.expires_at) || session.expires_at <= Date.now() / 1000)))) {
    throw new AuthenticatedFetchBoundaryError()
  }
  const headers = new Headers(init.headers)
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  // No await between the final caller-boundary check and dispatch. Metadata is
  // deliberately separate from RequestInit and is never sent to the endpoint.
  const requestInit = { ...init, headers }
  assertCurrent()
  return fetch(input, requestInit)
}
