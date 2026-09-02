import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Si falta el archivo frontend/.env, no rompemos toda la app:
 * dejamos este flag en false y App.tsx muestra un cartel explicando qué falta.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// OJO: acá va la anon/public key, pensada para vivir en el navegador.
// Nunca poner la service_role / secret key (esa es solo para el backend).
export const supabase = createClient(
  supabaseUrl ?? "http://localhost:54321",
  supabaseAnonKey ?? "placeholder-anon-key",
);
