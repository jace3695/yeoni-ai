/** Authenticated, boolean-only binding check for this trial; never reserve or synthesize. */
import {createServerSupabaseClient} from '@/lib/supabase-server';
import {createZephyrPreflightWrapper} from '@/lib/zephyr-28-wrappers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createZephyrPreflightWrapper(() => process.env, createServerSupabaseClient);
