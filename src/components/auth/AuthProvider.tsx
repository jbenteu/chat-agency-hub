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
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const markReady = (s: Session | null) => {
      console.log("[Auth] markReady called, session:", !!s, "initialLoadDone:", initialLoadDone.current);
      setSession(s);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setLoading(false);
      }
    };

    // 1. Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth] onAuthStateChange event:", event);
      markReady(session);
    });

    // 2. Then get current session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log("[Auth] getSession result, session:", !!session, "error:", error);
      markReady(session);
    }).catch((err) => {
      console.error("[Auth] getSession failed:", err);
      markReady(null);
    });

    // 3. Safety timeout - force loading=false after 5 seconds
    const timeout = setTimeout(() => {
      if (!initialLoadDone.current) {
        console.warn("[Auth] Safety timeout triggered - forcing loading=false");
        initialLoadDone.current = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
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
