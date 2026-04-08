import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AuthUser {
  id: string;
  fullName: string;
  role: string;
  hospitalId: string;
  hospitalName: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role, hospital_id")
        .eq("id", session.user.id)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      const { data: hospital } = await supabase
        .from("hospitals")
        .select("name")
        .eq("id", profile.hospital_id)
        .single();

      setUser({
        id: session.user.id,
        fullName: profile.full_name || "Unknown",
        role: profile.role,
        hospitalId: profile.hospital_id,
        hospitalName: hospital?.name || "Unknown Hospital",
      });
      setLoading(false);
    };

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
