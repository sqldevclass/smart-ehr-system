import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PaymentMethod { id: string; name_en: string; requires_terminal: boolean }
interface PosTerminal { id: string; name: string; bank_name: string | null; terminal_code: string | null }

export function usePaymentMethodsAndTerminals(open: boolean) {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [methodId, setMethodId] = useState("");
  const [terminalId, setTerminalIdState] = useState("");
  const [authCode, setAuthCode] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMethods([]);
    setTerminals([]);
    setMethodId("");
    setTerminalIdState("");
    setAuthCode("");
    if (!user?.hospitalId) return;
    const load = async () => {
      const [methodRes, terminalRes] = await Promise.all([
        supabase.from("payment_methods").select("id, name_en, requires_terminal")
          .eq("is_active", true).order("name_en"),
        (supabase as any).from("pos_terminals").select("id, name, bank_name, terminal_code")
          .eq("hospital_id", user.hospitalId).eq("is_active", true).order("name"),
      ]);
      if (cancelled) return;
      if (methodRes.error) toast.error(methodRes.error.message);
      if (terminalRes.error) toast.error(terminalRes.error.message);
      const activeMethods = (methodRes.data ?? []) as unknown as PaymentMethod[];
      const activeTerminals = (terminalRes.data ?? []) as PosTerminal[];
      setMethods(activeMethods);
      setTerminals(activeTerminals);
      setMethodId(activeMethods[0]?.id ?? "");
      let stored: string | null = null;
      try { stored = localStorage.getItem("pos_terminal_id"); } catch {}
      setTerminalIdState(activeTerminals.some((t) => t.id === stored)
        ? stored ?? "" : activeTerminals.length === 1 ? activeTerminals[0].id : "");
    };
    void load();
    return () => { cancelled = true; };
  }, [open, user?.hospitalId]);

  const setTerminalId = (id: string) => {
    setTerminalIdState(id);
    try { localStorage.setItem("pos_terminal_id", id); } catch {}
  };
  const requiresTerminal = methods.find((m) => m.id === methodId)?.requires_terminal === true;
  const isReady = !requiresTerminal || terminals.some((t) => t.id === terminalId);
  return {
    methods, terminals, methodId, setMethodId, terminalId, setTerminalId, authCode, setAuthCode,
    requiresTerminal, isReady,
    payload: {
      p_payment_method_id: methodId || null,
      p_pos_terminal_id: requiresTerminal ? terminalId || null : null,
      p_auth_code: requiresTerminal ? authCode.trim() || null : null,
    },
  };
}

export function PosPaymentFields({ hook, methodLabel, disabled = false }: {
  hook: ReturnType<typeof usePaymentMethodsAndTerminals>;
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
      {hook.requiresTerminal && (
        <>
          <div>
            <Label htmlFor={`${id}-terminal`}>POS-терминал</Label>
            <Select value={hook.terminalId} onValueChange={hook.setTerminalId} disabled={disabled}>
              <SelectTrigger id={`${id}-terminal`}><SelectValue placeholder="Выберите терминал" /></SelectTrigger>
              <SelectContent>
                {hook.terminals.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}{t.terminal_code ? ` (TID ${t.terminal_code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hook.terminals.length === 0 && <p className="mt-1 text-sm text-destructive">Нет активных POS-терминалов. Обратитесь к администратору.</p>}
          </div>
          <div>
            <Label htmlFor={`${id}-auth`}>Код авторизации (необязательно)</Label>
            <Input id={`${id}-auth`} maxLength={64} value={hook.authCode} disabled={disabled} onChange={(e) => hook.setAuthCode(e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}