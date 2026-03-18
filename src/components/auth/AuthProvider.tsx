import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const finishInitialization = (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);

      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error("[Auth] getSession error:", error.message);
        }
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
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
