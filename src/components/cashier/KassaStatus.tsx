import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useKassa } from "./useKassa";

export function KassaStatus() {
  const { kassa, isLoading, pair } = useKassa();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (isLoading) return null;
  if (kassa) {
    return (
      <p className="text-sm text-muted-foreground">
        Касса: {kassa.kassa_name} · POS: {kassa.pos_terminal_name || "не назначен"}
      </p>
    );
  }
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    await pair(code);
    setBusy(false);
    setCode("");
  };
  return (
    <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <p className="text-sm font-medium text-destructive">Этот компьютер не привязан к кассе. Приём платежей недоступен.</p>
      <div className="flex gap-2">
        <Input className="max-w-xs" placeholder="Код привязки" value={code} disabled={busy}
          onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
        <Button onClick={submit} disabled={busy || !code.trim()}>Привязать</Button>
      </div>
    </div>
  );
}
