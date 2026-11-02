/** UNREGISTERED entrypoint. After approval, copy to app/api/tts/once-28/route.ts. */
import {createServerSupabaseClient} from '@/lib/supabase-server';
import {createZephyrNextWrapper} from '@/lib/zephyr-28-wrappers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = createZephyrNextWrapper(() => process.env, createServerSupabaseClient);
