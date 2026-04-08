import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePhysicianId() {
  const { user } = useAuth();

  const { data: physicianId, isLoading } = useQuery({
    queryKey: ["physician-id", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("physicians")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    },
    enabled: !!user,
  });

  return { physicianId, isLoading, user };
}
