import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const recoverySearchParams =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const recoveryHashParams =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.hash.replace(/^#/, ""))
    : null;

// Supabase may consume and clear the recovery hash while the client is created.
// Capture it first so AuthGate can always render the password setup screen.
export const isPasswordRecoveryRedirect = Boolean(
  recoverySearchParams?.get("recovery") === "1" ||
  recoverySearchParams?.has("code") ||
  recoveryHashParams?.get("type") === "recovery",
);

// Importing a route must not initialize authentication in a waiting tab.
// createClient enforces browser storage-session ownership before SDK creation.
const boundMethods = new Map<PropertyKey, { source: unknown; value: unknown }>();
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? new Proxy({} as SupabaseClient, {
      get(_target, property) {
        // Promise assimilation and inspection must remain side-effect free.
        if (property === "then" || property === "toJSON") return undefined;
        if (property === Symbol.toStringTag) return "SupabaseClient";
        if (typeof property === "symbol") return undefined;
        const client = createClient();
        const value: unknown = Reflect.get(client, property, client);
        if (typeof value !== "function") return value;
        const previous = boundMethods.get(property);
        if (previous?.source === value) return previous.value;
        const bound: unknown = value.bind(client);
        boundMethods.set(property, { source: value, value: bound });
        return bound;
      },
    })
  : null;
