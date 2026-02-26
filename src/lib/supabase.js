import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables');
}

// Admin client — bypasses RLS, used for server-side operations
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Creates a client scoped to a user's JWT — respects RLS
export function supabaseForUser(accessToken) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
