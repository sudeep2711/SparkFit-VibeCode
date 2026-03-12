import { createClient } from '@supabase/supabase-js';

// Connected to the live Supabase Cloud Project: "sparkfit"
const supabaseUrl = 'https://pojshuemshcdllrqkhog.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvanNodWVtc2hjZGxscnFraG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MjU5MDAsImV4cCI6MjA4ODUwMTkwMH0.4mZa4BK0ff2LbpTovuDZy2stW4GwNmrdpAbdii6Ghcs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
