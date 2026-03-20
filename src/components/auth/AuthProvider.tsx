import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  userRole: string | null;
  isSuperAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  userRole: null,
  isSuperAdmin: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchUserRole = async (userId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).single();
      if (error || !data) return null;
      return data.role as string;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (nextSession?.user?.id) {
        const role = await fetchUserRole(nextSession.user.id);
        if (isMounted) setUserRole(role);
      } else {
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
    setUserRole(null);
  };

  const isSuperAdmin = userRole === "super_admin";

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, userRole, isSuperAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
