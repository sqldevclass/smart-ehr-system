import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, Link2, Pencil, Unlink } from "lucide-react";

interface KassaForm { id?: string; name: string; pos_terminal_id: string | null; is_active: boolean }
const emptyForm: KassaForm = { name: "", pos_terminal_id: null, is_active: true };
const NONE = "none";

interface Device { paired_at: string | null; last_seen_at: string | null; last_seen_ip: string | null }
interface KassaRow {
  id: string; name: string; pos_terminal_id: string | null; is_active: boolean;
  pos_terminals: { name: string } | null;
  kassa_devices: Device | Device[] | null;
}
const deviceOf = (k: KassaRow): Device | null =>
  Array.isArray(k.kassa_devices) ? k.kassa_devices[0] ?? null : k.kassa_devices ?? null;

export default function KassasPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<KassaForm>(emptyForm);
  const [code, setCode] = useState<string | null>(null);
  const [unpairTarget, setUnpairTarget] = useState<KassaRow | null>(null);

  const key = ["kassas", user?.hospitalId];
  const { data: kassas = [] } = useQuery({
    queryKey: key,
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("kassas")
        .select("id, name, pos_terminal_id, is_active, pos_terminals(name), kassa_devices(paired_at, last_seen_at, last_seen_ip)")
        .eq("hospital_id", user!.hospitalId).order("name");
      if (error) { toast.error(error.message); throw error; }
      return (data || []) as KassaRow[];
    },
  });
  const { data: terminals = [] } = useQuery({
    queryKey: ["pos-terminals-for-kassas", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("pos_terminals")
        .select("id, name, is_active").eq("hospital_id", user!.hospitalId).order("name");
      if (error) { toast.error(error.message); throw error; }
      return (data || []) as { id: string; name: string; is_active: boolean }[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const save = async () => {
    if (!user || !form.name.trim() || saving) return;
    setSaving(true);
    const payload = { name: form.name.trim(), pos_terminal_id: form.pos_terminal_id, is_active: form.is_active };
    const { error } = form.id
      ? await (supabase as any).from("kassas").update(payload).eq("id", form.id)
      : await (supabase as any).from("kassas").insert({ ...payload, hospital_id: user.hospitalId });
    setSaving(false);
    if (error) {
      const msg = String(error.message ?? "");
      if (error.code === "23505" && msg.includes("kassas_pos_terminal_uq")) toast.error("Этот POS-терминал уже назначен другой кассе.");
      else if (error.code === "23505" && msg.includes("kassas_hospital_name_uq")) toast.error("Касса с таким названием уже существует.");
      else toast.error(msg);
      return;
    }
    toast.success("Сохранено");
    setOpen(false);
    setForm(emptyForm);
    refresh();
  };

  const issueCode = async (k: KassaRow) => {
    const { data, error } = await supabase.rpc("issue_kassa_pairing_code" as any, { p_kassa_id: k.id } as any);
    if (error) { toast.error(error.message); return; }
    setCode(String(Array.isArray(data) ? data[0] : data));
    refresh();
  };
  const unpair = async () => {
    if (!unpairTarget) return;
    const { error } = await supabase.rpc("unpair_kassa" as any, { p_kassa_id: unpairTarget.id } as any);
    setUnpairTarget(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Компьютер отвязан");
    refresh();
  };

  const takenBy = (tid: string) => kassas.find((k) => k.pos_terminal_id === tid && k.id !== form.id);
  const terminalOptions = terminals.filter((t) => t.is_active || t.id === form.pos_terminal_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">Кассы</h2>
        <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>+ Добавить кассу</Button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              {["Название", "POS", "Компьютер", "Активна"].map((l) => <th key={l} className="p-3">{l}</th>)}
              <th className="p-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {kassas.map((k) => {
              const dev = deviceOf(k);
              const paired = !!dev?.paired_at;
              return (
                <tr key={k.id} className="border-t">
                  <td className="p-3">{k.name}</td>
                  <td className="p-3">{k.pos_terminals?.name || "—"}</td>
                  <td className="p-3">
                    {paired ? (
                      <>Привязан{dev?.last_seen_at ? ` · был онлайн ${format(new Date(dev.last_seen_at), "dd.MM.yyyy HH:mm")}` : ""}{dev?.last_seen_ip ? ` · IP ${dev.last_seen_ip}` : ""}</>
                    ) : <span className="text-muted-foreground">Не привязан</span>}
                  </td>
                  <td className="p-3"><Badge variant={k.is_active ? "default" : "secondary"}>{k.is_active ? "Да" : "Нет"}</Badge></td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" title="Редактировать кассу" aria-label="Редактировать кассу" onClick={() => {
                        setForm({ id: k.id, name: k.name, pos_terminal_id: k.pos_terminal_id, is_active: k.is_active });
                        setOpen(true);
                      }}><Pencil className="h-4 w-4" /></Button>
                      {k.is_active && (
                        <Button size="icon" variant="ghost" title="Привязать" aria-label="Привязать" onClick={() => issueCode(k)}><Link2 className="h-4 w-4" /></Button>
                      )}
                      {paired && (
                        <Button size="icon" variant="ghost" title="Отвязать" aria-label="Отвязать" onClick={() => setUnpairTarget(k)}><Unlink className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {kassas.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Нет касс</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Редактировать кассу" : "Добавить кассу"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kassa-name">Название *</Label>
              <Input id="kassa-name" required value={form.name} disabled={saving} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kassa-pos">POS-терминал</Label>
              <Select value={form.pos_terminal_id ?? NONE} disabled={saving}
                onValueChange={(v) => setForm({ ...form, pos_terminal_id: v === NONE ? null : v })}>
                <SelectTrigger id="kassa-pos"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не назначен</SelectItem>
                  {terminalOptions.map((t) => {
                    const taken = !!takenBy(t.id);
                    return <SelectItem key={t.id} value={t.id} disabled={taken}>{t.name}{taken ? " (занят)" : ""}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="kassa-active" checked={form.is_active} disabled={saving} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="kassa-active" className="cursor-pointer">Активна</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Отмена</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={code !== null} onOpenChange={(o) => { if (!o) setCode(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Код привязки</DialogTitle></DialogHeader>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono text-3xl font-bold tracking-widest">{code}</span>
            <Button size="icon" variant="ghost" title="Копировать" aria-label="Копировать" onClick={() => {
              navigator.clipboard?.writeText(code ?? "").then(() => toast.success("Скопировано"), () => toast.error("Не удалось скопировать"));
            }}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Откройте страницу кассира на нужном компьютере и введите этот код. Код действует 15 минут. Привязка заменит текущий компьютер этой кассы.
          </p>
          <DialogFooter><Button onClick={() => setCode(null)}>Закрыть</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!unpairTarget} onOpenChange={(o) => { if (!o) setUnpairTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отвязать компьютер</AlertDialogTitle>
            <AlertDialogDescription>
              Отвязать компьютер от кассы «{unpairTarget?.name}»? Приём платежей на нём станет невозможен.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={unpair}>Отвязать</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
