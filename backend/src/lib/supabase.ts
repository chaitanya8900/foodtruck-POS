import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    logger.info('Supabase client initialized successfully');
  } catch (err: any) {
    logger.warn(`Supabase client initialization warning: ${err?.message || err}`);
  }
} else {
  logger.warn('Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) not provided. Running in local auth mode.');
}

export const supabase = client;
export default supabase;
