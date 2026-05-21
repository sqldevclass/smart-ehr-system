import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AuthUser {
  id: string;
  fullName: string;
  roles: string[];
  hospitalId: string;
  hospitalName: string;
  timezone: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  hasRole: () => false,
  hasAnyRole: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, hospital_id")
      .eq("id", session.user.id)
      .single();

    if (!profile) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("roles(code)")
      .eq("user_id", session.user.id);

    const roles = (userRoles ?? [])
      .map((ur: any) => ur.roles?.code)
      .filter(Boolean) as string[];

    const { data: hospital } = await supabase
      .from("hospitals")
      .select("name")
      .eq("id", profile.hospital_id)
      .single();

    const { data: settings } = await supabase
      .from("hospital_settings")
      .select("timezone")
      .eq("hospital_id", profile.hospital_id)
      .maybeSingle();

    setUser({
      id: session.user.id,
      fullName: profile.full_name || "Unknown",
      roles,
      hospitalId: profile.hospital_id,
      hospitalName: hospital?.name || "Unknown Hospital",
      timezone: (settings as any)?.timezone || "Asia/Tashkent",
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
      } else {
        loadUser();
      }
    });
    return () => subscription.unsubscribe();
  }, [loadUser]);

  const hasRole = useCallback((role: string) => user?.roles.includes(role) ?? false, [user]);
  const hasAnyRole = useCallback((roles: string[]) => roles.some(r => user?.roles.includes(r)) ?? false, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, hasRole, hasAnyRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
