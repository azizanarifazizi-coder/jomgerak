import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Report } from '../../shared/jomgerak';

// Values come from mobile/.env (copy .env.example). Without them the app runs in demo mode.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key, { auth: { storage: AsyncStorage, persistSession: false } }) : null;
export const isLive = !!supabase;

// An anonymous id for this phone. No name, email or location is stored.
export async function getDeviceId() {
  try {
    const saved = await AsyncStorage.getItem('jg_device');
    if (saved) return saved;
    const id = 'dev-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    await AsyncStorage.setItem('jg_device', id);
    return id;
  } catch {
    return 'dev-' + Math.random().toString(36).slice(2, 12);
  }
}

export const saveLocal = (k: string, v: unknown) => AsyncStorage.setItem('jg_' + k, JSON.stringify(v)).catch(() => {});
export async function loadLocal<T>(k: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem('jg_' + k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}

// Retry once on a dropped connection, then give a plain error message.
export async function attempt<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<{ ok: boolean; data?: T | null; message?: string }> {
  for (let i = 0; i < 2; i++) {
    try {
      const { data, error } = await fn();
      if (!error) return { ok: true, data };
      if (i === 1) return { ok: false, message: error.message };
    } catch (e) {
      if (i === 1) return { ok: false, message: 'No connection. Check your internet and try again.' };
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return { ok: false, message: 'Something went wrong.' };
}

export type { Report };
