import { createClient } from '@supabase/supabase-js';

// Values come from dashboard/.env (copy .env.example). Without them the dashboard runs in demo mode.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && key ? createClient(url, key) : null;
