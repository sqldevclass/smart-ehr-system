import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

const TABS: { value: string; label: string; table: string }[] = [
  { value: "specializations", label: "Специализации", table: "specializations" },
  { value: "job_titles", label: "Должности", table: "job_titles" },
  { value: "staff_types", label: "Типы персонала", table: "staff_types" },
  { value: "degrees", label: "Учёные степени", table: "degrees" },
  { value: "qualifications", label: "Квалификации", table: "qualifications" },
];

export default function HRSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Настройки</h1>
        <p className="text-sm text-muted-foreground">Справочники HR модуля.</p>
      </div>
      <Tabs defaultValue="specializations">
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            <CrudSection table={t.table} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CrudSection({ table }: { table: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  const queryKey = ["hr-settings", table, user?.hospitalId];

  const { data: rows = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("id, name, code, is_active")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const addRow = async () => {
    if (!newName.trim()) { toast.error("Имя обязательно"); return; }
    const { error } = await supabase.from(table as any).insert({
      hospital_id: user!.hospitalId,
      name: newName.trim(),
      code: newCode.trim() || null,
      is_active: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Добавлено");
    setNewName(""); setNewCode(""); setAdding(false);
    refresh();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditName(r.name || "");
    setEditCode(r.code || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from(table as any)
      .update({ name: editName.trim(), code: editCode.trim() || null })
      .eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Обновлено");
    setEditingId(null);
    refresh();
  };

  const softDelete = async (id: string) => {
    if (!confirm("Деактивировать?")) return;
    const { error } = await supabase.from(table as any).update({ is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Деактивировано");
    refresh();
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">Записи</h3>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Код</TableHead>
            <TableHead>Активно</TableHead>
            <TableHead className="w-32"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adding && (
            <TableRow>
              <TableCell><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название" /></TableCell>
              <TableCell><Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Код" /></TableCell>
              <TableCell>—</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={addRow}><Check className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => { setAdding(false); setNewName(""); setNewCode(""); }}><X className="h-3 w-3" /></Button>
                </div>
              </TableCell>
            </TableRow>
          )}
          {rows.length === 0 && !adding ? (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Нет записей</TableCell></TableRow>
          ) : rows.map((r: any) => (
            <TableRow key={r.id} className={!r.is_active ? "opacity-50" : ""}>
              <TableCell>
                {editingId === r.id ? (
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : r.name}
              </TableCell>
              <TableCell>
                {editingId === r.id ? (
                  <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                ) : (r.code || "—")}
              </TableCell>
              <TableCell>{r.is_active ? "Да" : "Нет"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {editingId === r.id ? (
                    <>
                      <Button size="sm" variant="outline" onClick={saveEdit}><Check className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(r)}><Pencil className="h-3 w-3" /></Button>
                      {r.is_active && (
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => softDelete(r.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
