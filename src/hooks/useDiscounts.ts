import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Discount {
  id: string;
  name: string;
  percent: number;
  is_active: boolean;
}

export function useDiscounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["finance-discount-list", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("discounts")
        .select("id, name, percent, is_active")
        .eq("hospital_id", user.hospitalId).order("name");
      if (error) throw error;
      return (data ?? []) as Discount[];
    },
  });
}