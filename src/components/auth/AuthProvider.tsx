import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "gerente" | "gestor" | "sucesso_cliente" | "cliente";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /** Role from user_roles table (app_role enum) */
  appRole: string | null;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  appRole: null,
  isSuperAdmin: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appRole, setAppRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role, is_active")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data as unknown as UserProfile);
      }
    } catch (e) {
      console.error("[Auth] fetchProfile error:", e);
    }
  };

  const fetchAppRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .order("role", { ascending: true })
        .limit(1)
        .single();

      if (!error && data) {
        setAppRole(data.role as string);
      } else {
        setAppRole(null);
      }
    } catch {
      setAppRole(null);
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await Promise.all([fetchProfile(session.user.id), fetchAppRole(session.user.id)]);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const finishInitialization = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (nextSession?.user?.id) {
        await Promise.all([fetchProfile(nextSession.user.id), fetchAppRole(nextSession.user.id)]);
      } else {
        setProfile(null);
        setAppRole(null);
      }

      if (!initializedRef.current) {
        initializedRef.current = true;
        if (isMounted) setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (nextSession?.user?.id) {
        await Promise.all([fetchProfile(nextSession.user.id), fetchAppRole(nextSession.user.id)]);
      } else {
        setProfile(null);
        setAppRole(null);
      }

      if (!initializedRef.current) {
        initializedRef.current = true;
        if (isMounted) setLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) console.error("[Auth] getSession error:", error.message);
        finishInitialization(session ?? null);
      })
      .catch((error) => {
        console.error("[Auth] getSession exception:", error);
        finishInitialization(null);
      });

    const safetyTimeout = window.setTimeout(() => {
      if (!initializedRef.current && isMounted) {
        initializedRef.current = true;
        setLoading(false);
      }
    }, 7000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.clearTimeout(safetyTimeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAppRole(null);
  };

  const isSuperAdmin = appRole === "super_admin" || appRole === "admin";

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, appRole, isSuperAdmin, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
