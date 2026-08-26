/**
 * server/supabase.js
 *
 * Shared Supabase client for LocalTune.
 * Exports two clients:
 *   - supabaseAdmin: service-role key (full access, server-side only, NEVER expose to browser)
 *   - supabaseAnon: anon key (public-safe, for client-side signed URL generation)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

// Service-role client: full admin access (server-side only)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Anon client: public-safe (for client-side use if needed)
export const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'music';
