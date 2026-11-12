/** Inspection-only entrypoint; defaults off and requires exact branch/origin, auth and a reviewed one-use grant. */
import {createServerSupabaseClient} from '@/lib/supabase-server';
import {createZephyrNextWrapper} from '@/lib/zephyr-28-wrappers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createZephyrNextWrapper(() => process.env, createServerSupabaseClient);
