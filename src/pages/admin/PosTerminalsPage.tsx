import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

interface TerminalForm {
  id?: string;
  name: string;
  bank_name: string;
  terminal_code: string;
  merchant_id: string;
  location: string;
  is_active: boolean;
}
const emptyForm: TerminalForm = { name: "", bank_name: "", terminal_code: "", merchant_id: "", location: "", is_active: true };

export default function PosTerminalsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<TerminalForm>(emptyForm);
  const { data: terminals = [] } = useQuery({
    queryKey: ["pos-terminals", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any).from("pos_terminals")
        .select("id, name, bank_name, terminal_code, merchant_id, location, is_active")
        .eq("hospital_id", user.hospitalId).order("name");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });
  const save = async () => {
    if (!user || !form.name.trim() || saving) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(), bank_name: form.bank_name.trim() || null,
      terminal_code: form.terminal_code.trim() || null, merchant_id: form.merchant_id.trim() || null,
      location: form.location.trim() || null, is_active: form.is_active,
    };
    const { error } = form.id
      ? await (supabase as any).from("pos_terminals").update(payload).eq("id", form.id)
      : await (supabase as any).from("pos_terminals").insert({ ...payload, hospital_id: user.hospitalId });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Терминал с таким названием уже существует." : error.message);
      return;
    }
    toast.success("Сохранено");
    setOpen(false);
    setForm(emptyForm);
    qc.invalidateQueries({ queryKey: ["pos-terminals", user.hospitalId] });
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">POS-терминалы</h2>
        <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>+ Добавить терминал</Button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              {["Название", "Банк", "TID", "Merchant ID", "Расположение", "Активен"].map((label) => <th key={label} className="p-3">{label}</th>)}
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {terminals.map((t: any) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">{t.name}</td><td className="p-3">{t.bank_name || "—"}</td>
                <td className="p-3">{t.terminal_code || "—"}</td><td className="p-3">{t.merchant_id || "—"}</td>
                <td className="p-3">{t.location || "—"}</td>
                <td className="p-3"><Badge variant={t.is_active ? "default" : "secondary"}>{t.is_active ? "Да" : "Нет"}</Badge></td>
                <td className="p-3"><Button size="icon" variant="ghost" title="Редактировать терминал" aria-label="Редактировать терминал" onClick={() => {
                  setForm({ id: t.id, name: t.name, bank_name: t.bank_name || "", terminal_code: t.terminal_code || "", merchant_id: t.merchant_id || "", location: t.location || "", is_active: t.is_active });
                  setOpen(true);
                }}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {terminals.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Нет терминалов</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Редактировать терминал" : "Добавить терминал"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([
              ["name", "Название *"], ["bank_name", "Банк"], ["terminal_code", "TID"], ["merchant_id", "Merchant ID"], ["location", "Расположение"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`pos-${key}`}>{label}</Label>
                <Input id={`pos-${key}`} required={key === "name"} value={form[key]} disabled={saving} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Switch id="pos-active" checked={form.is_active} disabled={saving} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label htmlFor="pos-active" className="cursor-pointer">Активен</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Отмена</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}