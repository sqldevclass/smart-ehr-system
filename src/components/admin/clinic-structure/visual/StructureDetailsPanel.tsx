import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { ClinicBlock, ClinicFloor, effectiveRoomFloorId, departmentsOnFloor, computeStructureCounts, floorLabel, isInheritedFloor, useClinicStructure } from "../useClinicStructure";
import { StructureCounts } from "../StructureCounts";
import { StructureDepartment, StructureRoom, StructureWarehouse, useClinicStructureData } from "../useClinicStructureData";
import { useStructureActions } from "../useStructureActions";
import { DepartmentEditForm } from "../DepartmentEditForm";
import { RoomEditForm } from "../RoomEditForm";
import { WarehouseEditForm } from "../WarehouseEditForm";

export interface StructureSelection {
  kind: "block" | "floor" | "department" | "room" | "warehouse";
  id: string;
}

interface Props {
  selection: StructureSelection | null;
  onSelect: (selection: StructureSelection) => void;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function LinkList({ items, onPick }: { items: { id: string; label: string }[]; onPick: (id: string) => void }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-start gap-0.5">
      {items.map(item => (
        <Button key={item.id} variant="link" className="h-auto p-0 text-sm" onClick={() => onPick(item.id)}>{item.label}</Button>
      ))}
    </div>
  );
}

export function StructureDetailsPanel({ selection, onSelect, onClose }: Props) {
  const isMobile = useIsMobile();
  const structure = useClinicStructure();
  const { departments, rooms, warehouses } = useClinicStructureData();
  const actions = useStructureActions();
  const { canWrite, busy } = actions;
  const [tab, setTab] = useState<"view" | "edit">("view");
  const [blockName, setBlockName] = useState("");
  const [floorNumber, setFloorNumber] = useState("1");
  const [floorName, setFloorName] = useState("");
  const [floorLabelText, setFloorLabelText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const block: ClinicBlock | undefined = selection?.kind === "block" ? structure.blocks.find(b => b.id === selection.id) : undefined;
  const floor: ClinicFloor | undefined = selection?.kind === "floor" ? structure.floors.find(f => f.id === selection.id) : undefined;
  const department: StructureDepartment | undefined = selection?.kind === "department" ? departments.find(d => d.id === selection.id) : undefined;
  const room: StructureRoom | undefined = selection?.kind === "room" ? rooms.find(r => r.id === selection.id) : undefined;
  const warehouse: StructureWarehouse | undefined = selection?.kind === "warehouse" ? warehouses.find(w => w.id === selection.id) : undefined;
  const found = !!(block || floor || department || room || warehouse);

  useEffect(() => {
    setTab("view");
    setConfirmDelete(false);
    if (block) {
      setBlockName(block.name);
      const nums = (structure.floorsByBlock.get(block.id) ?? []).map(f => f.number);
      const positive = nums.filter(n => n > 0);
      setFloorNumber(positive.length ? String(Math.max(...positive) + 1) : "1");
      setFloorName("");
    }
    if (floor) setFloorLabelText(floor.label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.kind, selection?.id]);

  useEffect(() => {
    if (selection && !found && !actions.busy) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, selection]);

  const statusBadge = (active: boolean) => active ? <Badge>Активен</Badge> : <Badge variant="secondary">Неактивен</Badge>;

  const floorDepartments = (floorId: string) => departmentsOnFloor(floorId, departments, rooms);
  const { perFloor, perBlock } = computeStructureCounts({ blocks: structure.blocks, floorsByBlock: structure.floorsByBlock, departments, rooms });

  const title = block?.name ?? (floor ? floorLabel(floor) : undefined) ?? department?.name ?? room?.name ?? warehouse?.name ?? "";

  const renderView = () => {
    if (block) {
      const floors = structure.floorsByBlock.get(block.id) ?? [];
      return (
        <div className="space-y-3">
          <Row label="Название">{block.name}</Row>
          <Row label="Статус">{statusBadge(block.is_active)}</Row>
          <Row label="Итого"><StructureCounts counts={perBlock.get(block.id)} showFloors className="text-sm" /></Row>
        </div>
      );
    }
    if (floor) {
      const floorBlock = structure.blocks.find(b => b.id === floor.block_id);
      const depts = floorDepartments(floor.id);
      const floorRooms = rooms.filter(r => effectiveRoomFloorId(r, departments) === floor.id);
      const floorWhs = warehouses.filter(w => w.floor_id === floor.id);
      return (
        <div className="space-y-3">
          <Row label="Блок">{floorBlock?.name ?? "—"}</Row>
          <Row label="Этаж">{floorLabel(floor)}{floor.label ? <span className="ml-2 text-muted-foreground">(номер {floor.number})</span> : null}</Row>
          <Row label="Итого"><StructureCounts counts={perFloor.get(floor.id)} className="text-sm" /></Row>
          <Row label="Отделения"><LinkList items={depts.map(d => ({ id: d.id, label: d.name }))} onPick={id => onSelect({ kind: "department", id })} /></Row>
          <Row label="Палаты"><LinkList items={floorRooms.map(r => ({ id: r.id, label: r.name }))} onPick={id => onSelect({ kind: "room", id })} /></Row>
          <Row label="Склады"><LinkList items={floorWhs.map(w => ({ id: w.id, label: w.name }))} onPick={id => onSelect({ kind: "warehouse", id })} /></Row>
        </div>
      );
    }
    if (department) {
      const deptRooms = rooms.filter(r => r.department_id === department.id);
      return (
        <div className="space-y-3">
          <Row label="Название">{department.name}</Row>
          <Row label="Код">{department.code || "—"}</Row>
          <Row label="Основной этаж">{structure.formatFloor(department.floor_id)}</Row>
          <Row label="Статус">{statusBadge(department.is_active)}</Row>
          <Row label="Палаты">
            <LinkList
              items={deptRooms.map(r => ({ id: r.id, label: `${r.name} — ${structure.formatFloor(effectiveRoomFloorId(r, departments))}` }))}
              onPick={id => onSelect({ kind: "room", id })}
            />
          </Row>
        </div>
      );
    }
    if (room) {
      const dept = departments.find(d => d.id === room.department_id);
      const effective = effectiveRoomFloorId(room, departments);
      return (
        <div className="space-y-3">
          <Row label="Название">{room.name}</Row>
          <Row label="Тип">{room.room_types?.name ?? "—"}</Row>
          <Row label="Отделение">{dept ? <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onSelect({ kind: "department", id: dept.id })}>{dept.name}</Button> : "—"}</Row>
          <Row label="Коек">{room.capacity}</Row>
          <Row label="Этаж">
            {structure.formatFloor(effective)}
            {isInheritedFloor(room, departments) && <Badge variant="secondary" className="ml-2 text-xs font-normal text-muted-foreground">от отделения</Badge>}
          </Row>
          <Row label="Статус">{statusBadge(room.is_active)}</Row>
        </div>
      );
    }
    if (warehouse) {
      const dept = departments.find(d => d.id === warehouse.department_id);
      return (
        <div className="space-y-3">
          <Row label="Название">{warehouse.name}</Row>
          <Row label="Тип">{warehouse.warehouse_types?.name_ru ?? "—"}</Row>
          <Row label="Отделение">{dept ? <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onSelect({ kind: "department", id: dept.id })}>{dept.name}</Button> : (warehouse.departments?.name ?? "—")}</Row>
          <Row label="Этаж">{structure.formatFloor(warehouse.floor_id)}</Row>
          <Row label="Статус">{statusBadge(warehouse.is_active)}</Row>
        </div>
      );
    }
    return null;
  };

  const renderEdit = () => {
    if (block) {
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="panel-block-name">Название блока</Label>
            <div className="flex gap-2">
              <Input id="panel-block-name" value={blockName} onChange={e => setBlockName(e.target.value)} disabled={busy} />
              <Button disabled={busy || !blockName.trim() || blockName.trim() === block.name} onClick={() => actions.renameBlock(block, blockName)}>Сохранить</Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Статус</Label>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => actions.toggleBlock(block)}>
              {block.is_active ? "Деактивировать" : "Активировать"}
            </Button>
          </div>
          <div className="space-y-2 border-t pt-3">
            <Label>Добавить этаж</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" step={1} min={-10} max={200} value={floorNumber} onChange={e => setFloorNumber(e.target.value)} disabled={busy} aria-label="Номер этажа" />
              <Input value={floorName} onChange={e => setFloorName(e.target.value)} disabled={busy} placeholder="Название (необязательно)" aria-label="Название этажа" />
            </div>
            <p className="text-xs text-muted-foreground">Для подвала укажите отрицательное число, например -1</p>
            <Button variant="outline" size="sm" disabled={busy} onClick={async () => { const ok = await actions.addFloor(block, Number(floorNumber), floorName); if (ok) setFloorName(""); }}>Добавить этаж</Button>
          </div>
        </div>
      );
    }
    if (floor) {
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="panel-floor-label">Название этажа (необязательно)</Label>
            <div className="flex gap-2">
              <Input id="panel-floor-label" value={floorLabelText} onChange={e => setFloorLabelText(e.target.value)} disabled={busy} />
              <Button disabled={busy || floorLabelText.trim() === (floor.label ?? "")} onClick={() => actions.setFloorLabel(floor, floorLabelText)}>Сохранить</Button>
            </div>
          </div>
          <div className="space-y-2 border-t pt-3">
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-sm">Удалить этаж «{floorLabel(floor)}»? Используемый этаж удалить нельзя.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Отмена</Button>
                  <Button variant="destructive" size="sm" disabled={busy} onClick={async () => { const ok = await actions.deleteFloor(floor); if (ok) onClose(); }}>Удалить</Button>
                </div>
              </div>
            ) : (
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirmDelete(true)}>Удалить этаж</Button>
            )}
          </div>
        </div>
      );
    }
    if (department) return <DepartmentEditForm key={department.id} department={department} onSaved={() => setTab("view")} onCancel={() => setTab("view")} />;
    if (room) return <RoomEditForm key={room.id} room={room} onSaved={() => setTab("view")} onCancel={() => setTab("view")} />;
    if (warehouse) return <WarehouseEditForm key={warehouse.id} warehouse={warehouse} onSaved={() => setTab("view")} onCancel={() => setTab("view")} />;
    return null;
  };

  return (
    <Sheet open={!!selection && found} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={isMobile ? "max-h-[85vh] overflow-y-auto" : "overflow-y-auto sm:max-w-md"}>
        <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
        {canWrite ? (
          <Tabs value={tab} onValueChange={v => setTab(v as "view" | "edit")} className="mt-4">
            <TabsList>
              <TabsTrigger value="view">Просмотр</TabsTrigger>
              <TabsTrigger value="edit">Редактировать</TabsTrigger>
            </TabsList>
            <TabsContent value="view" className="mt-4">{renderView()}</TabsContent>
            <TabsContent value="edit" className="mt-4">{renderEdit()}</TabsContent>
          </Tabs>
        ) : (
          <div className="mt-4">{renderView()}</div>
        )}
      </SheetContent>
    </Sheet>
  );
}
