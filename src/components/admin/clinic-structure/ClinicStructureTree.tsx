import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Building2, ChevronRight, MoreHorizontal, Plus, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BlockFloorSelect } from "./BlockFloorSelect";
import { ClinicBlock, ClinicFloor, floorLabel, useClinicStructure } from "./useClinicStructure";

interface Item { id: string; name: string; floor_id: string | null; is_active: boolean }
interface Room extends Item { department_id: string | null; capacity: number; room_types: { name: string } | null }
type Entity = "departments" | "rooms" | "warehouses";
type Action = { type: "create" } | { type: "rename" | "toggle" | "floor-add"; block: ClinicBlock } | { type: "floor-label" | "floor-delete"; floor: ClinicFloor };

function TreeBranch({ title, children, expanded }: { title: React.ReactNode; children: React.ReactNode; expanded: boolean }) {
  return <Collapsible defaultOpen={expanded} className="border-b last:border-b-0">
    <div className="flex min-w-0 items-center gap-2 py-2">
      <CollapsibleTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 [&[data-state=open]>svg]:rotate-90" aria-label="Развернуть или свернуть"><ChevronRight className="h-4 w-4 transition-transform" /></Button></CollapsibleTrigger>
      <div className="min-w-0 flex-1">{title}</div>
    </div>
    <CollapsibleContent className="ml-4 border-l pl-3 sm:ml-8">{children}</CollapsibleContent>
  </Collapsible>;
}

export function ClinicStructureTree() {
  const { user, hasPermission } = useAuth();
  const canWrite = hasPermission("system.manage_settings");
  const qc = useQueryClient();
  const [, setParams] = useSearchParams();
  const structure = useClinicStructure();
  const [showInactive, setShowInactive] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("1");
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFloor, setBulkFloor] = useState<string | null>(null);
  const departmentsQuery = useQuery({
    queryKey: ["departments", user?.hospitalId], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code, is_active, floor_id").eq("hospital_id", user?.hospitalId ?? "").order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const roomsQuery = useQuery({
    queryKey: ["rooms", user?.hospitalId], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("id, name, room_type_id, capacity, is_active, department_id, floor_id, room_types(name, is_office_room)").eq("hospital_id", user?.hospitalId ?? "").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Room[];
    },
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", user?.hospitalId], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name, is_active, warehouse_type_id, department_id, floor_id, warehouse_types(name_ru), departments(name)").eq("hospital_id", user?.hospitalId ?? "").order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const allDepartments = departmentsQuery.data ?? [];
  const allRooms = roomsQuery.data ?? [];
  const departments = allDepartments.filter(d => showInactive || d.is_active);
  const rooms = allRooms.filter(r => showInactive || (r.is_active && (!r.department_id || allDepartments.find(d => d.id === r.department_id)?.is_active !== false)));
  const warehouses = (warehousesQuery.data ?? []).filter(w => showInactive || w.is_active);
  const blocks = structure.blocks.filter(b => showInactive || b.is_active);
  const refresh = () => {
    for (const key of ["clinic-structure", "departments", "departments-active", "departments-for-wh", "rooms", "warehouses"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const openAction = (next: Action) => {
    setAction(next);
    setName(next.type === "rename" ? next.block.name : next.type === "floor-label" ? next.floor.label ?? "" : "");
    setNumber(next.type === "floor-add" ? String(Math.max(0, ...(structure.floorsByBlock.get(next.block.id) ?? []).map(f => f.number)) + 1) : "1");
  };
  const saveAction = async () => {
    if (!action || !canWrite || !user) return;
    const n = Number(number);
    if ((action.type === "create" || action.type === "rename") && !name.trim()) return toast.error("Укажите название блока");
    if ((action.type === "create" || action.type === "floor-add") && (!number.trim() || !Number.isInteger(n) || (action.type === "create" && (n < 1 || n > 100)))) return toast.error(action.type === "create" ? "Количество этажей: целое число от 1 до 100" : "Укажите целый номер этажа");
    setBusy(true);
    try {
      let result;
      switch (action.type) {
        case "create": result = await supabase.rpc("create_clinic_block", { p_name: name.trim(), p_floors: n }); break;
        case "rename": result = await supabase.from("clinic_blocks").update({ name: name.trim() }).eq("id", action.block.id).eq("hospital_id", user.hospitalId); break;
        case "toggle": result = await supabase.from("clinic_blocks").update({ is_active: !action.block.is_active }).eq("id", action.block.id).eq("hospital_id", user.hospitalId); break;
        case "floor-add": result = await supabase.from("clinic_floors").insert({ hospital_id: user.hospitalId, block_id: action.block.id, number: n, label: name.trim() || null }); break;
        case "floor-label": result = await supabase.from("clinic_floors").update({ label: name.trim() || null }).eq("id", action.floor.id).eq("hospital_id", user.hospitalId); break;
        case "floor-delete": result = await supabase.from("clinic_floors").delete().eq("id", action.floor.id).eq("hospital_id", user.hospitalId); break;
      }
      if (result.error) throw result.error;
      toast.success("Сохранено"); refresh(); setAction(null);
    } catch (err: unknown) {
      toast.error(err && typeof err === "object" && "message" in err ? String(err.message) : "Не удалось сохранить");
    } finally { setBusy(false); }
  };
  const assign = async (entity: Entity, ids: string[], floorId: string | null) => {
    if (!canWrite || !user || !ids.length) return;
    setBusy(true);
    try {
      const { error } = await supabase.from(entity).update({ floor_id: floorId }).in("id", ids).eq("hospital_id", user.hospitalId);
      if (error) throw error;
      toast.success("Этаж назначен"); refresh();
      if (entity === "rooms") { setSelected(new Set()); setBulkFloor(null); }
    } catch (err: unknown) {
      toast.error(err && typeof err === "object" && "message" in err ? String(err.message) : "Не удалось назначить этаж");
    } finally { setBusy(false); }
  };
  const go = (tab: Entity) => setParams({ tab });
  const itemLink = (item: Item, entity: Entity, detail?: string) => <Button variant="ghost" className={`h-auto max-w-full justify-start whitespace-normal px-2 py-1 text-left ${!item.is_active ? "text-muted-foreground opacity-60" : ""}`} onClick={() => go(entity)}>
    <span>{item.name}{detail && <span className="ml-2 text-xs text-muted-foreground">{detail}</span>}{!item.is_active && <Badge variant="secondary" className="ml-2">Неактивен</Badge>}</span>
  </Button>;
  const roomLink = (r: Room) => itemLink(r, "rooms", [r.room_types?.name, r.capacity > 0 ? `${r.capacity} коек` : null].filter(Boolean).join(" · "));
  const floorDepartments = (id: string) => departments.filter(d => rooms.some(r => r.floor_id === id && r.department_id === d.id) || (!allRooms.some(r => r.department_id === d.id) && d.floor_id === id));
  const counts = (floorIds: string[]) => {
    const depts = new Set(floorIds.flatMap(id => floorDepartments(id).map(d => d.id)));
    return `${depts.size} отделений · ${rooms.filter(r => r.floor_id && floorIds.includes(r.floor_id)).length} палат`;
  };
  const unassigned: { entity: Entity; title: string; items: Item[] }[] = [
    { entity: "departments", title: "Отделения", items: departments.filter(d => !d.floor_id) },
    { entity: "rooms", title: "Палаты", items: rooms.filter(r => !r.floor_id) },
    { entity: "warehouses", title: "Склады", items: warehouses.filter(w => !w.floor_id) },
  ];
  const error = structure.error || departmentsQuery.error || roomsQuery.error || warehousesQuery.error;
  const title = action?.type === "create" ? "Добавить блок" : action?.type === "rename" ? "Переименовать блок" : action?.type === "toggle" ? (action.block.is_active ? "Деактивировать блок" : "Активировать блок") : action?.type === "floor-add" ? "Добавить этаж" : action?.type === "floor-label" ? "Изменить название этажа" : "Удалить этаж";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Switch id="inactive-structure" checked={showInactive} onCheckedChange={setShowInactive} /><Label htmlFor="inactive-structure">Показывать неактивные</Label></div>
      <Button onClick={() => openAction({ type: "create" })} disabled={!canWrite || busy}><Plus className="mr-2 h-4 w-4" />Добавить блок</Button>
    </div>
    {error ? <p className="text-sm text-destructive">{error.message || "Не удалось загрузить структуру"}</p> : structure.isLoading || departmentsQuery.isLoading || roomsQuery.isLoading || warehousesQuery.isLoading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : <>
      {structure.blocks.length === 0 && <div className="space-y-3 py-8 text-center"><Building2 className="mx-auto h-10 w-10 text-muted-foreground" /><p>Блок → Этаж → Отделение → Палата → Койка</p><Button onClick={() => openAction({ type: "create" })} disabled={!canWrite}>Добавить блок</Button></div>}
      {blocks.map((block, index) => {
        const floors = structure.floorsByBlock.get(block.id) ?? [];
        return <div key={block.id} className={!block.is_active ? "text-muted-foreground opacity-60" : ""}><TreeBranch expanded={index === 0} title={<div className="flex flex-wrap items-center gap-2"><Building2 className="h-4 w-4" /><span className="font-semibold">{block.name}</span><span className="text-xs text-muted-foreground">{floors.length} этажей · {counts(floors.map(f => f.id))}</span>{!block.is_active && <Badge variant="secondary">Неактивен</Badge>}<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="ml-auto h-8 w-8" disabled={!canWrite || busy} aria-label={`Действия блока ${block.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => openAction({ type: "rename", block })}>Переименовать</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction({ type: "toggle", block })}>{block.is_active ? "Деактивировать" : "Активировать"}</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction({ type: "floor-add", block })}>Добавить этаж</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}>
          {floors.map(floor => <TreeBranch key={floor.id} expanded={index === 0} title={<div className="flex flex-wrap items-center gap-2"><span className="font-medium">{floorLabel(floor)}</span><span className="text-xs text-muted-foreground">{counts([floor.id])}</span><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="ml-auto h-8 w-8" disabled={!canWrite || busy} aria-label={`Действия этажа ${floorLabel(floor)}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => openAction({ type: "floor-label", floor })}>Изменить название этажа</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction({ type: "floor-delete", floor })}>Удалить этаж</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}>
            {floorDepartments(floor.id).map(d => <TreeBranch key={d.id} expanded={index === 0} title={itemLink(d, "departments")}><div className="flex flex-col items-start pb-2">{rooms.filter(r => r.floor_id === floor.id && r.department_id === d.id).map(r => <div key={r.id}>{roomLink(r)}</div>)}</div></TreeBranch>)}
            {rooms.filter(r => r.floor_id === floor.id && (!r.department_id || !allDepartments.some(d => d.id === r.department_id))).map(r => <div key={r.id}>{roomLink(r)}</div>)}
            {warehouses.some(w => w.floor_id === floor.id) && <div className="space-y-1 py-2"><h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Warehouse className="h-3 w-3" />Склады</h3>{warehouses.filter(w => w.floor_id === floor.id).map(w => <div key={w.id}>{itemLink(w, "warehouses")}</div>)}</div>}
          </TreeBranch>)}
        </TreeBranch></div>;
      })}
      {unassigned.some(g => g.items.length) && <section className="space-y-4 border-t pt-4"><h2 className="text-lg font-semibold">Не привязано</h2>{unassigned.filter(g => g.items.length).map(group => <div key={group.entity} className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{group.title}</h3>{group.entity === "rooms" && <Button variant="outline" size="sm" disabled={!canWrite || busy} onClick={() => { setBulk(!bulk); setSelected(new Set()); }}>{bulk ? "Отменить выбор" : "Выбрать несколько"}</Button>}</div>{group.entity === "rooms" && bulk && <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1"><BlockFloorSelect value={bulkFloor} onChange={setBulkFloor} disabled={busy || !canWrite} /></div><Button disabled={busy || !canWrite || !bulkFloor || !selected.size} onClick={() => assign("rooms", [...selected], bulkFloor)}>Применить ({selected.size})</Button></div>}{group.items.map(item => <div key={item.id} className={`grid min-w-0 grid-cols-1 items-center gap-2 border-b py-2 sm:grid-cols-2 ${!item.is_active ? "opacity-60" : ""}`}><div className="flex min-w-0 items-center gap-2">{group.entity === "rooms" && bulk && <Checkbox aria-label={`Выбрать ${item.name}`} checked={selected.has(item.id)} disabled={busy || !canWrite} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); if (checked) next.add(item.id); else next.delete(item.id); return next; })} />}{itemLink(item, group.entity)}</div><BlockFloorSelect value={item.floor_id} onChange={id => assign(group.entity, [item.id], id)} disabled={busy || !canWrite} /></div>)}</div>)}</section>}
    </>}
    <Dialog open={!!action} onOpenChange={open => { if (!open && !busy) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      {(action?.type === "create" || action?.type === "rename" || action?.type === "floor-label" || action?.type === "floor-add") && <div className="space-y-1.5"><Label htmlFor="structure-name">{action.type === "create" || action.type === "rename" ? "Название блока" : "Название этажа (необязательно)"}</Label><Input id="structure-name" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></div>}
      {(action?.type === "create" || action?.type === "floor-add") && <div className="space-y-1.5"><Label htmlFor="structure-number">{action.type === "create" ? "Количество этажей" : "Номер этажа"}</Label><Input id="structure-number" type="number" step={1} min={action.type === "create" ? 1 : undefined} max={action.type === "create" ? 100 : undefined} value={number} onChange={e => setNumber(e.target.value)} disabled={busy} /></div>}
      {action?.type === "floor-delete" && <p className="text-sm">Удалить этаж «{floorLabel(action.floor)}»? Используемый этаж удалить нельзя.</p>}
      {action?.type === "toggle" && <p className="text-sm">{action.block.is_active ? "Деактивировать" : "Активировать"} блок «{action.block.name}»?</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Отмена</Button><Button variant={action?.type === "floor-delete" ? "destructive" : "default"} disabled={busy || !canWrite} onClick={saveAction}>{busy ? "Сохранение…" : action?.type === "floor-delete" ? "Удалить" : "Сохранить"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}