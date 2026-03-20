import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "gerente" | "gestor" | "sucesso_cliente" | "cliente";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: UserRole | null;
  phone: string | null;
  is_active: boolean | null;
  created_by: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  userRole: string | null;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  userRole: null,
  isSuperAdmin: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role, phone, is_active, created_by")
        .eq("id", userId)
        .single();
      if (error || !data) return null;
      return data as Profile;
    } catch {
      return null;
    }
  };

  const fetchAppRole = async (userId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1)
        .single();
      if (error || !data) return null;
      return data.role as string;
    } catch {
      return null;
    }
  };

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const p = await fetchProfile(userId);
    if (p) setProfile(p);
  }, [session?.user?.id]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (nextSession?.user?.id) {
        const [p, appRole] = await Promise.all([
          fetchProfile(nextSession.user.id),
          fetchAppRole(nextSession.user.id),
        ]);
        if (isMounted) {
          setProfile(p);
          setUserRole(appRole);
        }
      } else {
        setProfile(null);
        setUserRole(null);
      }

      if (!initializedRef.current && isMounted) {
        initializedRef.current = true;
        setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      if (initializedRef.current) {
        initializeAuth(nextSession);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) console.error("[Auth] getSession error:", error.message);
        initializeAuth(session ?? null);
      })
      .catch((error) => {
        console.error("[Auth] getSession exception:", error);
        initializeAuth(null);
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
    setUserRole(null);
  };

  const isSuperAdmin = userRole === "super_admin" || userRole === "admin" || profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, userRole, isSuperAdmin, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};
