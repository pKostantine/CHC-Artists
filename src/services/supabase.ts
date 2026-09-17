import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl=process.env.EXPO_PUBLIC_SUPABASE_URL; const supabaseAnonKey=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; if(!supabaseUrl||!supabaseAnonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in, then restart the bundler -- these are compiled into the bundle, not read at runtime.');
const webStorage=Platform.OS==='web'&&typeof globalThis.localStorage!=='undefined'?globalThis.localStorage:undefined;
export const supabase=createClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:Boolean(webStorage),storage:webStorage,autoRefreshToken:true,detectSessionInUrl:Platform.OS==='web'}});
