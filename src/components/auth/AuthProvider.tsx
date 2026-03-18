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

  const markReady = (s: Session | null) => {
    setSession(s);
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. Set up listener FIRST so we never miss events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      markReady(session);
    });

    // 2. Then get the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      markReady(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
