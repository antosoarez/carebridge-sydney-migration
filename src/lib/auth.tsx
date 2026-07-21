import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearThoughts } from "@/lib/brain-dump-store";

export type Role = "advocate" | "client" | null;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: Role;
  isAdvocate: boolean;
  isClient: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  isAdvocate: false,
  isClient: false,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function roleHomePath(role: Role): string {
  if (role === "advocate") return "/advocate/dashboard";
  if (role === "client") return "/client/dashboard";
  return "/account-pending";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async () => {
    const { data, error } = await supabase.rpc("get_my_role");
    if (error) {
      console.error("Failed to load role", error);
      setRole(null);
    } else {
      setRole((data as Role) ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setLoading(true);
        setTimeout(() => {
          void fetchRole();
        }, 0);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        setLoading(true);
        void fetchRole();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []); 
  const signOut = async () => {
    const currentUserId = user?.id;
    await supabase.auth.signOut();
    clearThoughts(currentUserId);
    setRole(null);
  };

  const value = useMemo(
    () => ({
      user,
      session,
      role,
      isAdvocate: role === "advocate",
      isClient: role === "client",
      loading,
      signOut,
    }),
    [user, session, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
