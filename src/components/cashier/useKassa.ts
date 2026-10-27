import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TOKEN_KEY = "kassa_device_token";

export interface MyKassa {
  kassa_id: string;
  kassa_name: string;
  pos_terminal_id: string | null;
  pos_terminal_name: string | null;
}

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function useKassa() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readToken());

  const { data, isLoading } = useQuery({
    queryKey: ["my-kassa", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_kassa" as any, { p_device_token: token } as any);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as MyKassa[];
      return rows[0] ?? null;
    },
  });

  const pair = async (code: string) => {
    const { data, error } = await supabase.rpc("pair_kassa_device" as any, { p_code: code.trim() } as any);
    if (error) { toast.error(error.message); return; }
    const res: any = Array.isArray(data) ? data[0] : data;
    if (!res?.device_token) { toast.error("Не удалось привязать кассу."); return; }
    try { localStorage.setItem(TOKEN_KEY, res.device_token); } catch {}
    setToken(res.device_token);
    toast.success(`Касса «${res.kassa_name}» привязана`);
    qc.invalidateQueries({ queryKey: ["my-kassa"] });
  };

  return { token, kassa: token ? data ?? null : null, isLoading: !!token && isLoading, pair };
}
