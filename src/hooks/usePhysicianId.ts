import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePhysicianId() {
  const { user } = useAuth();

  const { data: physicianId, isLoading } = useQuery({
    queryKey: ["staff-role-id", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("person_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.person_id) return null;
      const { data } = await supabase
        .from("staff_roles")
        .select("id")
        .eq("person_id", profile.person_id)
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!user,
  });

  return { physicianId, isLoading, user };
}
