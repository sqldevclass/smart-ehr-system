import { useState } from "react";
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
import { ClinicBlock, ClinicFloor, effectiveRoomFloorId, departmentsOnFloor, computeStructureCounts, floorLabel, useClinicStructure } from "./useClinicStructure";
import { StructureCounts } from "./StructureCounts";
import { StructureRoom, useClinicStructureData } from "./useClinicStructureData";
import { useStructureActions } from "./useStructureActions";

interface Item { id: string; name: string; floor_id: string | null; is_active: boolean }
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
  const { user } = useAuth();
  const actions = useStructureActions();
  const { canWrite, busy } = actions;
  const [, setParams] = useSearchParams();
  const structure = useClinicStructure();
  const [showInactive, setShowInactive] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("1");
  const [basements, setBasements] = useState("0");
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFloor, setBulkFloor] = useState<string | null>(null);
  const { departmentsQuery, roomsQuery, warehousesQuery } = useClinicStructureData();
  const allDepartments = departmentsQuery.data ?? [];
  const allRooms = roomsQuery.data ?? [];
  const departments = allDepartments.filter(d => showInactive || d.is_active);
  const rooms = allRooms.filter(r => showInactive || (r.is_active && (!r.department_id || allDepartments.find(d => d.id === r.department_id)?.is_active !== false)));
  const warehouses = (warehousesQuery.data ?? []).filter(w => showInactive || w.is_active);
  const blocks = structure.blocks.filter(b => showInactive || b.is_active);
  const openAction = (next: Action) => {
    setAction(next);
    setName(next.type === "rename" ? next.block.name : next.type === "floor-label" ? next.floor.label ?? "" : "");
    const floorNumbers = next.type === "floor-add" ? (structure.floorsByBlock.get(next.block.id) ?? []).map(f => f.number) : [];
    const positive = floorNumbers.filter(n => n > 0);
    setNumber(positive.length ? String(Math.max(...positive) + 1) : "1");
    setBasements("0");
  };
  const saveAction = async () => {
    if (!action || !canWrite) return;
    let ok = false;
    switch (action.type) {
      case "create": ok = await actions.createBlock(name, Number(number), Number(basements)); break;
      case "rename": ok = await actions.renameBlock(action.block, name); break;
      case "toggle": ok = await actions.toggleBlock(action.block); break;
      case "floor-add": ok = await actions.addFloor(action.block, Number(number), name); break;
      case "floor-label": ok = await actions.setFloorLabel(action.floor, name); break;
      case "floor-delete": ok = await actions.deleteFloor(action.floor); break;
    }
    if (ok) setAction(null);
  };
  const assign = async (entity: Entity, ids: string[], floorId: string | null) => {
    if (!canWrite || !user || !ids.length) return;
    try {
      const { error } = await supabase.from(entity).update({ floor_id: floorId }).in("id", ids).eq("hospital_id", user.hospitalId);
      if (error) throw error;
      toast.success("Этаж назначен"); actions.refresh();
      if (entity === "rooms") { setSelected(new Set()); setBulkFloor(null); }
    } catch (err: unknown) {
      toast.error(err && typeof err === "object" && "message" in err ? String(err.message) : "Не удалось назначить этаж");
    }
  };
  const go = (tab: Entity) => setParams({ tab });
  const itemLink = (item: Item, entity: Entity, detail?: string) => <Button variant="ghost" className={`h-auto max-w-full justify-start whitespace-normal px-2 py-1 text-left ${!item.is_active ? "text-muted-foreground opacity-60" : ""}`} onClick={() => go(entity)}>
    <span>{item.name}{detail && <span className="ml-2 text-xs text-muted-foreground">{detail}</span>}{!item.is_active && <Badge variant="secondary" className="ml-2">Неактивен</Badge>}</span>
  </Button>;
  const roomLink = (r: StructureRoom) => itemLink(r, "rooms", [r.room_types?.name, r.capacity > 0 ? `${r.capacity} коек` : null].filter(Boolean).join(" · "));
  const floorDepartments = (id: string) => departmentsOnFloor(id, departments, rooms, allDepartments);
  const { perFloor, perBlock } = computeStructureCounts({ blocks: structure.blocks, floorsByBlock: structure.floorsByBlock, departments, rooms, allDepartments });
  const unassigned: { entity: Entity; title: string; items: Item[] }[] = [
    { entity: "departments", title: "Отделения", items: departments.filter(d => !d.floor_id) },
    { entity: "rooms", title: "Палаты", items: rooms.filter(r => effectiveRoomFloorId(r, allDepartments) === null) },
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
        return <div key={block.id} className={!block.is_active ? "text-muted-foreground opacity-60" : ""}><TreeBranch expanded={index === 0} title={<div className="flex flex-wrap items-center gap-2"><Building2 className="h-4 w-4" /><span className="font-semibold">{block.name}</span><StructureCounts counts={perBlock.get(block.id)} showFloors />{!block.is_active && <Badge variant="secondary">Неактивен</Badge>}<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="ml-auto h-8 w-8" disabled={!canWrite || busy} aria-label={`Действия блока ${block.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => openAction({ type: "rename", block })}>Переименовать</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction({ type: "toggle", block })}>{block.is_active ? "Деактивировать" : "Активировать"}</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction({ type: "floor-add", block })}>Добавить этаж</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}>
          {floors.map(floor => <TreeBranch key={floor.id} expanded={index === 0} title={<div className="flex flex-wrap items-center gap-2"><span className="font-medium">{floorLabel(floor)}</span><StructureCounts counts={perFloor.get(floor.id)} /><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="ml-auto h-8 w-8" disabled={!canWrite || busy} aria-label={`Действия этажа ${floorLabel(floor)}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onSelect={() => openAction({ type: "floor-label", floor })}>Изменить название этажа</DropdownMenuItem><DropdownMenuItem onSelect={() => openAction({ type: "floor-delete", floor })}>Удалить этаж</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}>
            {floorDepartments(floor.id).map(d => <TreeBranch key={d.id} expanded={index === 0} title={itemLink(d, "departments")}><div className="flex flex-col items-start pb-2">{rooms.filter(r => effectiveRoomFloorId(r, allDepartments) === floor.id && r.department_id === d.id).map(r => <div key={r.id}>{roomLink(r)}</div>)}</div></TreeBranch>)}
            {rooms.filter(r => effectiveRoomFloorId(r, allDepartments) === floor.id && (!r.department_id || !allDepartments.some(d => d.id === r.department_id))).map(r => <div key={r.id}>{roomLink(r)}</div>)}
            {warehouses.some(w => w.floor_id === floor.id) && <div className="space-y-1 py-2"><h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Warehouse className="h-3 w-3" />Склады</h3>{warehouses.filter(w => w.floor_id === floor.id).map(w => <div key={w.id}>{itemLink(w, "warehouses")}</div>)}</div>}
          </TreeBranch>)}
        </TreeBranch></div>;
      })}
      {unassigned.some(g => g.items.length) && <section className="space-y-4 border-t pt-4"><h2 className="text-lg font-semibold">Не привязано</h2>{unassigned.filter(g => g.items.length).map(group => <div key={group.entity} className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{group.title}</h3>{group.entity === "rooms" && <Button variant="outline" size="sm" disabled={!canWrite || busy} onClick={() => { setBulk(!bulk); setSelected(new Set()); }}>{bulk ? "Отменить выбор" : "Выбрать несколько"}</Button>}</div>{group.entity === "rooms" && bulk && <div className="flex flex-wrap items-center gap-2"><div className="min-w-0 flex-1"><BlockFloorSelect value={bulkFloor} onChange={setBulkFloor} disabled={busy || !canWrite} /></div><Button disabled={busy || !canWrite || !bulkFloor || !selected.size} onClick={() => assign("rooms", [...selected], bulkFloor)}>Применить ({selected.size})</Button></div>}{group.items.map(item => <div key={item.id} className={`grid min-w-0 grid-cols-1 items-center gap-2 border-b py-2 sm:grid-cols-2 ${!item.is_active ? "opacity-60" : ""}`}><div className="flex min-w-0 items-center gap-2">{group.entity === "rooms" && bulk && <Checkbox aria-label={`Выбрать ${item.name}`} checked={selected.has(item.id)} disabled={busy || !canWrite} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); if (checked) next.add(item.id); else next.delete(item.id); return next; })} />}{itemLink(item, group.entity)}</div><BlockFloorSelect value={item.floor_id} onChange={id => assign(group.entity, [item.id], id)} disabled={busy || !canWrite} /></div>)}</div>)}</section>}
    </>}
    <Dialog open={!!action} onOpenChange={open => { if (!open && !busy) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      {(action?.type === "create" || action?.type === "rename" || action?.type === "floor-label" || action?.type === "floor-add") && <div className="space-y-1.5"><Label htmlFor="structure-name">{action.type === "create" || action.type === "rename" ? "Название блока" : "Название этажа (необязательно)"}</Label><Input id="structure-name" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></div>}
      {(action?.type === "create" || action?.type === "floor-add") && <div className="space-y-1.5"><Label htmlFor="structure-number">{action.type === "create" ? "Количество этажей" : "Номер этажа"}</Label><Input id="structure-number" type="number" step={1} min={action.type === "create" ? 0 : -10} max={action.type === "create" ? 100 : 200} value={number} onChange={e => setNumber(e.target.value)} disabled={busy} />{action.type === "floor-add" && <p className="text-xs text-muted-foreground">Для подвала укажите отрицательное число, например -1</p>}</div>}
      {action?.type === "create" && <div className="space-y-1.5"><Label htmlFor="structure-basements">Подвальных этажей</Label><Input id="structure-basements" type="number" step={1} min={0} max={10} value={basements} onChange={e => setBasements(e.target.value)} disabled={busy} /></div>}
      {action?.type === "floor-delete" && <p className="text-sm">Удалить этаж «{floorLabel(action.floor)}»? Используемый этаж удалить нельзя.</p>}
      {action?.type === "toggle" && <p className="text-sm">{action.block.is_active ? "Деактивировать" : "Активировать"} блок «{action.block.name}»?</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Отмена</Button><Button variant={action?.type === "floor-delete" ? "destructive" : "default"} disabled={busy || !canWrite} onClick={saveAction}>{busy ? "Сохранение…" : action?.type === "floor-delete" ? "Удалить" : "Сохранить"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
