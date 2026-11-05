import { useState } from "react";
import { Building2, Plus, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ClinicBlock, ClinicFloor, effectiveRoomFloorId, floorLabel, useClinicStructure } from "../useClinicStructure";
import { StructureDepartment, StructureRoom, StructureWarehouse, useClinicStructureData } from "../useClinicStructureData";
import { useStructureActions } from "../useStructureActions";
import { StructureDetailsPanel, StructureSelection } from "./StructureDetailsPanel";

const PALETTE = [
  "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-100",
  "bg-lime-100 text-lime-900 dark:bg-lime-900/40 dark:text-lime-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  "bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-100",
  "bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100",
];

export function departmentColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const selectedRing = "ring-2 ring-primary ring-offset-1 ring-offset-background";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function VisualStructure() {
  const structure = useClinicStructure();
  const { departmentsQuery, roomsQuery, warehousesQuery } = useClinicStructureData();
  const actions = useStructureActions();
  const { canWrite, busy } = actions;
  const [showInactive, setShowInactive] = useState(false);
  const [selection, setSelection] = useState<StructureSelection | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("1");
  const [basements, setBasements] = useState("0");

  const allDepartments = departmentsQuery.data ?? [];
  const allRooms = roomsQuery.data ?? [];
  const departments = allDepartments.filter(d => showInactive || d.is_active);
  const rooms = allRooms.filter(r => showInactive || (r.is_active && (!r.department_id || allDepartments.find(d => d.id === r.department_id)?.is_active !== false)));
  const warehouses = (warehousesQuery.data ?? []).filter(w => showInactive || w.is_active);
  const blocks = structure.blocks.filter(b => showInactive || b.is_active);

  const isSelected = (kind: StructureSelection["kind"], id: string) => selection?.kind === kind && selection.id === id;
  const select = (kind: StructureSelection["kind"], id: string) => setSelection({ kind, id });

  const floorDepartments = (floorId: string): StructureDepartment[] =>
    departments.filter(d => d.floor_id === floorId || rooms.some(r => effectiveRoomFloorId(r, allDepartments) === floorId && r.department_id === d.id));
  const deptRoomsOnFloor = (floorId: string, deptId: string): StructureRoom[] =>
    rooms.filter(r => effectiveRoomFloorId(r, allDepartments) === floorId && r.department_id === deptId);
  const orphanRoomsOnFloor = (floorId: string): StructureRoom[] =>
    rooms.filter(r => effectiveRoomFloorId(r, allDepartments) === floorId && (!r.department_id || !allDepartments.some(d => d.id === r.department_id)));
  const floorWarehouses = (floorId: string): StructureWarehouse[] => warehouses.filter(w => w.floor_id === floorId);

  const roomTile = (r: StructureRoom) => (
    <button
      key={r.id}
      type="button"
      aria-label={`Палата ${r.name}`}
      onClick={() => select("room", r.id)}
      className={`rounded border bg-background/70 px-2 py-1 text-left text-xs shadow-sm ${focusRing} ${!r.is_active ? "opacity-60" : ""} ${isSelected("room", r.id) ? selectedRing : ""}`}
    >
      <span className="block font-medium">{r.name}</span>
      <span className="block text-muted-foreground">{[r.room_types?.name, r.capacity > 0 ? `${r.capacity} коек` : null].filter(Boolean).join(" · ")}</span>
    </button>
  );

  const floorRow = (floor: ClinicFloor) => {
    const depts = floorDepartments(floor.id);
    const orphans = orphanRoomsOnFloor(floor.id);
    const whs = floorWarehouses(floor.id);
    const empty = depts.length === 0 && orphans.length === 0 && whs.length === 0;
    return (
      <div key={floor.id} className="flex items-stretch gap-2 border-t first:border-t-0">
        <button
          type="button"
          aria-label={`Этаж ${floorLabel(floor)}`}
          onClick={() => select("floor", floor.id)}
          className={`flex w-24 shrink-0 items-center rounded-bl px-2 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/60 ${focusRing} ${isSelected("floor", floor.id) ? selectedRing : ""}`}
        >
          {floorLabel(floor)}
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-2 pr-2">
          {empty && <span className="text-xs text-muted-foreground">Пусто</span>}
          {depts.map(d => {
            const deptRooms = deptRoomsOnFloor(floor.id, d.id);
            return (
              <div key={d.id} className={`rounded-md px-2 py-1.5 ${departmentColor(d.id)} ${!d.is_active ? "opacity-60" : ""}`}>
                <button
                  type="button"
                  aria-label={`Отделение ${d.name}`}
                  onClick={() => select("department", d.id)}
                  className={`block rounded text-left text-xs font-semibold ${focusRing} ${isSelected("department", d.id) ? "underline underline-offset-2" : ""}`}
                >
                  {d.name}{!d.is_active ? " (неактивно)" : ""}
                </button>
                {deptRooms.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{deptRooms.map(roomTile)}</div>}
              </div>
            );
          })}
          {orphans.map(roomTile)}
          {whs.length > 0 && (
            <div className="rounded-md border border-dashed px-2 py-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Warehouse className="h-3 w-3" />Склады</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {whs.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    aria-label={`Склад ${w.name}`}
                    onClick={() => select("warehouse", w.id)}
                    className={`flex items-center gap-1 rounded border bg-background/70 px-2 py-1 text-left text-xs shadow-sm ${focusRing} ${!w.is_active ? "opacity-60" : ""} ${isSelected("warehouse", w.id) ? selectedRing : ""}`}
                  >
                    <Warehouse className="h-3 w-3 text-muted-foreground" />{w.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const buildingColumn = (block: ClinicBlock) => {
    const floors = [...(structure.floorsByBlock.get(block.id) ?? [])].sort((a, b) => b.number - a.number);
    const groundIndex = floors.findIndex(f => f.number <= 0);
    return (
      <div key={block.id} className={`min-w-[280px] flex-1 rounded-lg border bg-card ${!block.is_active ? "opacity-60" : ""}`}>
        <button
          type="button"
          aria-label={`Блок ${block.name}`}
          onClick={() => select("block", block.id)}
          className={`flex w-full items-center gap-2 rounded-t-lg border-b px-3 py-2 text-left font-semibold hover:bg-muted/60 ${focusRing} ${isSelected("block", block.id) ? selectedRing : ""}`}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{block.name}{!block.is_active ? " (неактивен)" : ""}</span>
          <span className="text-xs font-normal text-muted-foreground">{floors.length} этажей</span>
        </button>
        <div>
          {floors.map((floor, i) => (
            <div key={floor.id}>
              {i === groundIndex && (
                <div className="flex items-center gap-2 px-2 py-1" aria-hidden>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Уровень земли</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              {floorRow(floor)}
            </div>
          ))}
          {floors.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">Нет этажей</p>}
        </div>
      </div>
    );
  };

  const unassigned: { kind: StructureSelection["kind"]; title: string; items: { id: string; name: string; is_active: boolean }[] }[] = [
    { kind: "department", title: "Отделения", items: departments.filter(d => !d.floor_id) },
    { kind: "room", title: "Палаты", items: rooms.filter(r => effectiveRoomFloorId(r, allDepartments) === null) },
    { kind: "warehouse", title: "Склады", items: warehouses.filter(w => !w.floor_id) },
  ];

  const openCreate = () => { setName(""); setNumber("1"); setBasements("0"); setCreateOpen(true); };
  const saveCreate = async () => {
    const ok = await actions.createBlock(name, Number(number), Number(basements));
    if (ok) setCreateOpen(false);
  };

  const error = structure.error || departmentsQuery.error || roomsQuery.error || warehousesQuery.error;
  const loading = structure.isLoading || departmentsQuery.isLoading || roomsQuery.isLoading || warehousesQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="inactive-visual" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="inactive-visual">Показывать неактивные</Label>
        </div>
        <Button onClick={openCreate} disabled={!canWrite || busy}><Plus className="mr-2 h-4 w-4" />Добавить блок</Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error.message || "Не удалось загрузить структуру"}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          {structure.blocks.length === 0 && (
            <div className="space-y-3 py-8 text-center">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
              <p>Блок → Этаж → Отделение → Палата → Койка</p>
              <Button onClick={openCreate} disabled={!canWrite}>Добавить блок</Button>
            </div>
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:overflow-x-auto sm:pb-2">
            {blocks.map(buildingColumn)}
          </div>
          {unassigned.some(g => g.items.length > 0) && (
            <section className="space-y-3 border-t pt-4">
              <h2 className="text-lg font-semibold">Не привязано</h2>
              {unassigned.filter(g => g.items.length > 0).map(group => (
                <div key={group.kind} className="space-y-1.5">
                  <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.name}
                        onClick={() => select(group.kind, item.id)}
                        className={`rounded-full border bg-muted px-3 py-1 text-xs ${focusRing} ${!item.is_active ? "opacity-60" : ""} ${isSelected(group.kind, item.id) ? selectedRing : ""}`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      <StructureDetailsPanel selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
      <Dialog open={createOpen} onOpenChange={open => { if (!open && !busy) setCreateOpen(false); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добавить блок</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="visual-block-name">Название блока</Label>
            <Input id="visual-block-name" value={name} onChange={e => setName(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visual-block-floors">Количество этажей</Label>
            <Input id="visual-block-floors" type="number" step={1} min={0} max={100} value={number} onChange={e => setNumber(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visual-block-basements">Подвальных этажей</Label>
            <Input id="visual-block-basements" type="number" step={1} min={0} max={10} value={basements} onChange={e => setBasements(e.target.value)} disabled={busy} />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button disabled={busy || !canWrite} onClick={saveCreate}>{busy ? "Сохранение…" : "Сохранить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
