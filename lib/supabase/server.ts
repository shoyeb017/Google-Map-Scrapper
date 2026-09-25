import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isSupabaseConfigured() {
  return Boolean(url && (anon || service));
}

// Server-side client: prefers service role, falls back to anon.
export function getSupabaseAdmin() {
  if (!url) return null;
  const key = service || anon;
  if (!key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabasePublic() {
  if (!url || !anon) return null;
  return createSupabaseClient(url, anon);
}
