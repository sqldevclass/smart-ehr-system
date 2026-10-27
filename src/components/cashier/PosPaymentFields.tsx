import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useKassa } from "./useKassa";

interface PaymentMethod { id: string; name_en: string; requires_terminal: boolean }

export function usePaymentMethodFields(open: boolean) {
  const { user } = useAuth();
  const { token, kassa } = useKassa();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState("");
  const [authCode, setAuthCode] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMethods([]);
    setMethodId("");
    setAuthCode("");
    if (!user?.hospitalId) return;
    const load = async () => {
      const { data, error } = await supabase.from("payment_methods").select("id, name_en, requires_terminal")
        .eq("is_active", true).order("name_en");
      if (cancelled) return;
      if (error) toast.error(error.message);
      const active = (data ?? []) as unknown as PaymentMethod[];
      setMethods(active);
      setMethodId(active[0]?.id ?? "");
    };
    void load();
    return () => { cancelled = true; };
  }, [open, user?.hospitalId]);

  const requiresTerminal = methods.find((m) => m.id === methodId)?.requires_terminal === true;
  const isReady = kassa !== null && (!requiresTerminal || kassa.pos_terminal_id !== null);
  const notReadyMessage = kassa === null ? "Этот компьютер не привязан к кассе." : "К кассе не назначен POS-терминал.";
  return {
    methods, methodId, setMethodId, authCode, setAuthCode, kassa,
    requiresTerminal, isReady, notReadyMessage,
    payload: {
      p_payment_method_id: methodId || null,
      p_auth_code: requiresTerminal ? authCode.trim() || null : null,
      p_device_token: token,
    },
  };
}

export function PosPaymentFields({ hook, methodLabel, disabled = false }: {
  hook: ReturnType<typeof usePaymentMethodFields>;
  methodLabel: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${id}-method`}>{methodLabel}</Label>
        <Select value={hook.methodId} onValueChange={hook.setMethodId} disabled={disabled}>
          <SelectTrigger id={`${id}-method`}><SelectValue placeholder="Select method" /></SelectTrigger>
          <SelectContent>
            {hook.methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {hook.kassa === null ? (
        <p className="text-sm text-destructive">Этот компьютер не привязан к кассе. Приём платежей недоступен.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Касса: {hook.kassa.kassa_name}</p>
      )}
      {hook.requiresTerminal && hook.kassa !== null && (
        <>
          {hook.kassa.pos_terminal_id
            ? <p className="text-sm">POS: {hook.kassa.pos_terminal_name}</p>
            : <p className="text-sm text-destructive">К кассе не назначен POS-терминал.</p>}
          <div>
            <Label htmlFor={`${id}-auth`}>Код авторизации (необязательно)</Label>
            <Input id={`${id}-auth`} maxLength={64} value={hook.authCode} disabled={disabled} onChange={(e) => hook.setAuthCode(e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}
