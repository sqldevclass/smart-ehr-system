import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WarehouseUnit } from "./useWarehouseUnits";

interface Props {
  units: WarehouseUnit[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  mode: "transfer" | "writeoff";
}

export function UnitPicker({ units, selectedIds, onChange, mode }: Props) {
  const selectable = units.filter((unit) => mode === "writeoff" || unit.info_status === "ready");
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">Выбрано {units.filter((unit) => selectedIds.includes(unit.equipment_id)).length} из {units.length}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => onChange(selectable.map((unit) => unit.equipment_id))}>
        {mode === "transfer" ? "Выбрать все готовые" : "Выбрать все"}
      </Button>
    </div>
    <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
      {units.map((unit) => {
        const disabled = mode === "transfer" && unit.info_status === "pending";
        const row = <label className={`flex items-start gap-3 p-2 text-sm ${disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}`}>
          <Checkbox className="mt-0.5" disabled={disabled} checked={selectedIds.includes(unit.equipment_id)} aria-label={`${unit.product_name} · ${unit.model || "—"} · С/Н ${unit.serial_number || "—"}`} onCheckedChange={(checked) => onChange(checked === true ? [...selectedIds.filter((id) => id !== unit.equipment_id), unit.equipment_id] : selectedIds.filter((id) => id !== unit.equipment_id))} />
          <span className="min-w-0 break-words">{unit.product_name} · {unit.model || "—"} · {unit.serial_number ? `С/Н ${unit.serial_number}` : "—"}</span>
          {unit.info_status === "pending" && <Badge variant="secondary" className="shrink-0">Нет информации</Badge>}
        </label>;
        return disabled ? <Tooltip key={unit.equipment_id}><TooltipTrigger asChild><div tabIndex={0}>{row}</div></TooltipTrigger><TooltipContent>Заполните информацию в разделе Инвентаризация</TooltipContent></Tooltip> : <div key={unit.equipment_id}>{row}</div>;
      })}
    </div>
  </div>;
}