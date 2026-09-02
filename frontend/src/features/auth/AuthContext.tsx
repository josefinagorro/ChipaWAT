import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Profile } from "./types";

type SignUpResult = {
  needsEmailConfirmation: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, color, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("No se pudo cargar el perfil:", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    color: data.color,
    isAdmin: data.is_admin ?? false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session) {
        fetchProfile(data.session.user.id).then((loadedProfile) => {
          if (isMounted) setProfile(loadedProfile);
        });
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession) {
        fetchProfile(nextSession.user.id).then((loadedProfile) => {
          if (isMounted) setProfile(loadedProfile);
        });
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Para volver a leer el perfil después de editarlo (pantalla de Cuenta),
  // así el nombre nuevo aparece al toque en toda la app.
  const refreshProfile = useCallback(async () => {
    const userId = session?.user.id;

    if (!userId) {
      setProfile(null);
      return;
    }

    setProfile(await fetchProfile(userId));
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      async signUp(email, password, name) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
          },
        });

        if (error) throw error;

        // Si el proyecto tiene "Confirm email" activado (default en Supabase),
        // data.session viene null hasta que la usuaria confirma el link del mail.
        return { needsEmailConfirmation: !data.session };
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, profile, loading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth se tiene que usar dentro de <AuthProvider>.");
  }
  return context;
}
