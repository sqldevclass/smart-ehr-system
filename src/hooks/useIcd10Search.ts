import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { applySearch, hasSearch } from "@/lib/search";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

// Shared ICD-10 lookup (leaf codes) for every ICD-10 search box.
export function useIcd10Search(term: string, enabled = true) {
  const debounced = useDebouncedValue(term);
  return useQuery({
    queryKey: ["icd10-search", debounced],
    enabled: enabled && hasSearch(debounced),
    queryFn: async () => {
      const { data, error } = await applySearch(
        supabase.from("icd10_codes").select("id, code, name_ru").eq("is_leaf", true),
        debounced
      )
        .order("code")
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });
}
