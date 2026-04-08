import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://efgyjxanyqrlifjzznae.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmZ3lqeGFueXFybGlmanp6bmFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTU2MTIsImV4cCI6MjA5MTE3MTYxMn0.VDp70tpK0rKryXTUdjBQLsaL18hg7FiYtonOjS3ZDWI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
