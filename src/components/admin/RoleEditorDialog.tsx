import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchInput from "@/components/shared/SearchInput";
import { matchesSearch } from "@/lib/search";
import { toast } from "sonner";
import { Copy, ShieldAlert } from "lucide-react";

export interface RoleOverviewRow {
  id: string;
  code: string;
  name_ru: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  dashboard_route: string | null;
  user_count: number;
  permission_count: number;
}

export type RoleEditorMode = "create" | "edit" | "view" | "copy";

interface Permission {
  id: string;
  code: string;
  name_ru: string;
  module: string;
  access_type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleOverviewRow | null;
  mode: RoleEditorMode;
  onSaved: () => void;
  onCopy?: (role: RoleOverviewRow) => void;
}

const MODULE_LABELS: Record<string, string> = {
  workspace: "Рабочие места",
  documents: "Документы",
  finance: "Финансы",
  hospitalizations: "Госпитализации",
  hr: "Персонал",
  invoices: "Счета",
  patients: "Пациенты",
  payments: "Платежи",
  prescriptions: "Назначения",
  reports: "Отчёты",
  schedules: "Расписание",
  services: "Услуги",
  system: "Система",
  warehouse: "Склад",
};
const moduleLabel = (m: string) => MODULE_LABELS[m] ?? m;

const ACCESS_TYPES: Record<string, { label: string; className: string }> = {
  read: { label: "Просмотр", className: "bg-muted text-muted-foreground" },
  write: { label: "Изменение", className: "bg-primary/10 text-primary" },
  delete: { label: "Удаление", className: "bg-destructive/15 text-destructive" },
  approve: { label: "Утверждение", className: "bg-chart-4/20 text-chart-4" },
  manage: { label: "Управление", className: "bg-chart-2/20 text-chart-2" },
  access: { label: "Доступ", className: "bg-accent text-accent-foreground" },
};

const NO_ROUTE = "none";
export const WORKSPACE_PREFIX = "workspace.";
export const workspaceRoute = (code: string) => code.replace(WORKSPACE_PREFIX, "/");

function PermissionRow({ p, checked, disabled, onToggle }: {
  p: Permission; checked: boolean; disabled: boolean; onToggle: () => void;
}) {
  const access = ACCESS_TYPES[p.access_type];
  return (
    <label className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer">
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <div className="text-sm">{p.name_ru}</div>
        <div className="text-xs text-muted-foreground font-mono truncate">{p.code}</div>
      </div>
      <Badge variant="secondary" className={access?.className ?? ""}>{access?.label ?? p.access_type}</Badge>
    </label>
  );
}

function ModuleSection({ module, items, selected, disabled, onToggle, onSetMany }: {
  module: string;
  items: Permission[];
  selected: Set<string>;
  disabled: boolean;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], add: string[]) => void;
}) {
  const count = items.filter((p) => selected.has(p.id)).length;
  const allSelected = count === items.length && items.length > 0;
  const ids = items.map((p) => p.id);
  return (
    <AccordionItem value={module}>
      <div className="flex items-center gap-2">
        <AccordionTrigger className="flex-1 hover:no-underline">
          <span className="flex items-baseline gap-2">
            <span>{moduleLabel(module)}</span>
            <span className="text-xs font-normal text-muted-foreground">выбрано {count} из {items.length}</span>
          </span>
        </AccordionTrigger>
        {!disabled && (
          <>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => onSetMany(ids, allSelected ? [] : ids)}>
              {allSelected ? "Снять все" : "Выбрать все"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => onSetMany(ids, items.filter((p) => p.access_type === "read").map((p) => p.id))}>
              Только просмотр
            </Button>
          </>
        )}
      </div>
      <AccordionContent>
        <div className="space-y-0.5">
          {items.map((p) => (
            <PermissionRow key={p.id} p={p} checked={selected.has(p.id)} disabled={disabled} onToggle={() => onToggle(p.id)} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export default function RoleEditorDialog({ open, onOpenChange, role, mode, onSaved, onCopy }: Props) {
  const readOnly = mode === "view";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [route, setRoute] = useState<string>(NO_ROUTE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: permissions = [] } = useQuery({
    queryKey: ["all-permissions"],
    enabled: open,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions")
        .select("id, code, name_ru, module, access_type").order("code");
      if (error) { toast.error(error.message); throw error; }
      return (data ?? []) as Permission[];
    },
  });

  const { data: rolePermissionIds } = useQuery({
    queryKey: ["role-permissions", role?.id],
    enabled: open && !!role && mode !== "create",
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions")
        .select("permission_id").eq("role_id", role!.id);
      if (error) { toast.error(error.message); throw error; }
      return ((data ?? []) as { permission_id: string }[]).map((r) => r.permission_id);
    },
  });

  useEffect(() => {
    if (!open) return;
    setSearch("");
    if (mode === "create" || !role) {
      setName(""); setDescription(""); setIsActive(true); setRoute(NO_ROUTE); setSelected(new Set());
      return;
    }
    setName(mode === "copy" ? `Копия — ${role.name_ru}` : role.name_ru);
    setDescription(role.description ?? "");
    setIsActive(mode === "copy" ? true : role.is_active);
    setRoute(role.dashboard_route ?? NO_ROUTE);
  }, [open, mode, role]);

  useEffect(() => {
    if (open && mode !== "create" && rolePermissionIds) setSelected(new Set(rolePermissionIds));
  }, [open, mode, rolePermissionIds]);

  const workspaceOptions = useMemo(
    () => permissions.filter((p) => p.code.startsWith(WORKSPACE_PREFIX) && selected.has(p.id)),
    [permissions, selected],
  );

  useEffect(() => {
    if (route === NO_ROUTE || permissions.length === 0) return;
    if (mode !== "create" && !rolePermissionIds) return;
    if (!workspaceOptions.some((p) => workspaceRoute(p.code) === route)) setRoute(NO_ROUTE);
  }, [workspaceOptions, route, permissions.length, mode, rolePermissionIds]);

  const grouped = useMemo(() => {
    const filtered = permissions.filter((p) => matchesSearch([p.name_ru, p.code], search));
    const map = new Map<string, Permission[]>();
    for (const p of filtered) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "workspace") return -1;
      if (b === "workspace") return 1;
      return moduleLabel(a).localeCompare(moduleLabel(b), "ru");
    });
  }, [permissions, search]);

  const firstModule = grouped[0]?.[0];

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setMany = (ids: string[], add: string[]) => setSelected((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => next.delete(id));
    add.forEach((id) => next.add(id));
    return next;
  });

  const trimmed = name.trim();
  const handleSave = async () => {
    if (!trimmed) { toast.error("Укажите название роли"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("save_role", {
      p_role_id: mode === "edit" && role ? role.id : null,
      p_name: trimmed,
      p_description: description.trim() || null,
      p_is_active: isActive,
      p_dashboard_route: route === NO_ROUTE ? null : route,
      p_permission_ids: Array.from(selected),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Роль сохранена");
    onOpenChange(false);
    onSaved();
  };

  const title = mode === "create" ? "Новая роль" : mode === "edit" ? "Изменить роль" : mode === "copy" ? "Копировать роль" : "Просмотр роли";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 space-y-4">
          {readOnly && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" /> Системная роль — только просмотр
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Название *</Label>
              <Input id="role-name" value={name} maxLength={100} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Стартовая страница</Label>
              <Select value={route} onValueChange={setRoute} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROUTE}>Не задана</SelectItem>
                  {workspaceOptions.map((p) => (
                    <SelectItem key={p.id} value={workspaceRoute(p.code)}>{p.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="role-desc">Описание</Label>
              <Textarea id="role-desc" rows={2} value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="role-active" checked={isActive} disabled={readOnly} onCheckedChange={setIsActive} />
              <Label htmlFor="role-active">Активна</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Права</Label>
            <SearchInput value={search} onChange={setSearch} placeholder="Поиск по названию или коду" />
            {grouped.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Ничего не найдено</p>
            ) : (
              <Accordion key={`${firstModule}-${search ? "s" : ""}`} type="multiple" defaultValue={firstModule ? [firstModule] : []}>
                {grouped.map(([module, items]) => (
                  <ModuleSection key={module} module={module} items={items} selected={selected}
                    disabled={readOnly} onToggle={toggle} onSetMany={setMany} />
                ))}
              </Accordion>
            )}
          </div>
        </div>
        <div className="sticky bottom-0 border-t bg-background px-6 py-2 text-sm text-muted-foreground">
          Выбрано прав: {selected.size}
        </div>
        <DialogFooter className="px-6 pb-6 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{readOnly ? "Закрыть" : "Отмена"}</Button>
          {readOnly ? (
            role && onCopy && (
              <Button onClick={() => onCopy(role)}><Copy className="mr-2 h-4 w-4" />Копировать</Button>
            )
          ) : (
            <Button onClick={handleSave} disabled={saving || !trimmed}>{saving ? "Сохранение…" : "Сохранить"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
