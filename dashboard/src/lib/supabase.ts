import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Create client only if we have valid config (avoids build-time errors)
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    if (!supabaseUrl || !supabaseKey) {
      // Return a dummy client that won't crash during SSR/build
      return createClient("https://placeholder.supabase.co", "placeholder");
    }
    _client = createClient(supabaseUrl, supabaseKey);
  }
  return _client;
}

export const supabase = getClient();
