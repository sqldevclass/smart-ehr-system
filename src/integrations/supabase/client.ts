import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://efgyjxanyqrlifjzznae.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NAV4xE-ROrGKl_-FF1Dw2w_BZ4Vdjyz';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
