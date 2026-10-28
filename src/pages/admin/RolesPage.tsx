import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RoleEditorDialog, { type RoleEditorMode, type RoleOverviewRow, WORKSPACE_PREFIX, workspaceRoute } from "@/components/admin/RoleEditorDialog";
import { toast } from "sonner";
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";

type Pending =
  | { kind: "deactivate"; role: RoleOverviewRow }
  | { kind: "delete"; role: RoleOverviewRow };

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

export default function RolesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<{ open: boolean; mode: RoleEditorMode; role: RoleOverviewRow | null }>({
    open: false, mode: "create", role: null,
  });
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const key = ["roles-overview", user?.hospitalId];
  const { data: roles = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_roles_overview");
      if (error) { toast.error(error.message); throw error; }
      return (data ?? []) as RoleOverviewRow[];
    },
  });

  const { data: workspaceNames = {} } = useQuery({
    queryKey: ["workspace-permission-names"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("code, name_ru").like("code", `${WORKSPACE_PREFIX}%`);
      if (error) throw error;
      return Object.fromEntries(
        ((data ?? []) as { code: string; name_ru: string }[]).map((p) => [workspaceRoute(p.code), p.name_ru]),
      ) as Record<string, string>;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["role-permissions"] });
    qc.invalidateQueries({ queryKey: ["role-labels"] });
  };

  const openEditor = (mode: RoleEditorMode, role: RoleOverviewRow | null = null) => setEditor({ open: true, mode, role });

  const setActive = async (role: RoleOverviewRow, isActive: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("set_role_active", { p_role_id: role.id, p_is_active: isActive });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isActive ? "Роль активирована" : "Роль деактивирована");
    refresh();
  };

  const onToggleActive = (role: RoleOverviewRow, next: boolean) => {
    if (!next && role.user_count > 0) setPending({ kind: "deactivate", role });
    else setActive(role, next);
  };

  const deleteRole = async (role: RoleOverviewRow) => {
    setBusy(true);
    const { error } = await supabase.rpc("delete_role", { p_role_id: role.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Роль удалена");
    refresh();
  };

  const confirmPending = async () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === "deactivate") await setActive(p.role, false);
    else await deleteRole(p.role);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Роли</h1>
        <Button onClick={() => openEditor("create")}><Plus className="mr-2 h-4 w-4" />Создать роль</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Активна</TableHead>
              <TableHead className="text-right">Пользователей</TableHead>
              <TableHead className="text-right">Прав</TableHead>
              <TableHead>Стартовая страница</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Загрузка…</TableCell></TableRow>
            ) : roles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Нет ролей</TableCell></TableRow>
            ) : roles.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.name_ru}</div>
                  {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant={r.is_system ? "secondary" : "outline"}>{r.is_system ? "Системная" : "Своя"}</Badge>
                </TableCell>
                <TableCell>
                  {r.is_system ? (
                    <span className="text-muted-foreground" aria-disabled>—</span>
                  ) : (
                    <Switch checked={r.is_active} disabled={busy} aria-label="Активна"
                      onCheckedChange={(v) => onToggleActive(r, v)} />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.user_count}</TableCell>
                <TableCell className="text-right tabular-nums">{r.permission_count}</TableCell>
                <TableCell>{r.dashboard_route ? workspaceNames[r.dashboard_route] ?? r.dashboard_route : "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {r.is_system ? (
                      <IconAction label="Просмотр" onClick={() => openEditor("view", r)}><Eye className="h-4 w-4" /></IconAction>
                    ) : (
                      <IconAction label="Изменить" onClick={() => openEditor("edit", r)}><Pencil className="h-4 w-4" /></IconAction>
                    )}
                    <IconAction label="Копировать" onClick={() => openEditor("copy", r)}><Copy className="h-4 w-4" /></IconAction>
                    {!r.is_system && (
                      <IconAction label="Удалить" onClick={() => setPending({ kind: "delete", role: r })}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </IconAction>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RoleEditorDialog
        open={editor.open}
        mode={editor.mode}
        role={editor.role}
        onOpenChange={(open) => setEditor((e) => ({ ...e, open }))}
        onSaved={refresh}
        onCopy={(role) => setEditor({ open: true, mode: "copy", role })}
      />

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.kind === "delete" ? "Удалить роль?" : "Деактивировать роль?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "delete"
                ? `Роль «${pending.role.name_ru}» будет удалена.`
                : `${pending?.role.user_count ?? 0} пользователей потеряют доступ, который даёт эта роль. Продолжить?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>
              {pending?.kind === "delete" ? "Удалить" : "Продолжить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
