import { useState, type ComponentType, type ReactNode } from "react";
import { ArrowDown, ArrowRight, Building2, ChevronDown, ChevronRight, Clock, Trash2, Truck, Undo2, UserRound, Warehouse, Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney } from "@/components/reports/reportTotals";
import { fmtUnits, primaryStockType, sumBuckets, type Bucket, type Lifecycle, type TurnoverKind } from "./turnoverTypes";

interface NodeProps {
  icon: ComponentType<{ className?: string }>; title: string; bucket: Bucket; cumulative?: boolean;
  stock?: boolean; itemMode: boolean; unit: string; children?: ReactNode;
}

function Node({ icon: Icon, title, bucket, cumulative, stock, itemMode, unit, children }: NodeProps) {
  const here = itemMode && stock && bucket.units > 0;
  const dim = itemMode && stock && bucket.units <= 0;
  return (
    <div className={`w-full md:w-auto md:flex-1 min-w-0 rounded-lg border bg-card p-3 ${here ? "border-primary ring-1 ring-primary" : ""} ${dim ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-primary shrink-0" /><span className="truncate">{title}</span>
      </div>
      {here && <Badge className="mt-1">сейчас здесь</Badge>}
      <div className="mt-2 text-lg font-bold text-foreground">
        {itemMode ? `${fmtUnits(bucket.units)} ${unit}` : `${bucket.items} позиций`}
      </div>
      <div className="text-xs text-muted-foreground">{fmtMoney(bucket.value)}{cumulative ? " · всего" : ""}</div>
      {children}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex md:flex-col items-center justify-center gap-1 text-muted-foreground shrink-0 md:w-16 py-1">
      <ArrowRight className="hidden md:block h-5 w-5" />
      <ArrowDown className="md:hidden h-5 w-5" />
      {label && <span className="text-[11px] text-center leading-tight">{label}</span>}
    </div>
  );
}

export function TurnoverDiagramSkeleton() {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full md:flex-1" />)}
    </div>
  );
}

export function TurnoverDiagram({ data, kind }: { data: Lifecycle; kind: TurnoverKind }) {
  const [deptOpen, setDeptOpen] = useState(false);
  const itemMode = !!data.item_id;
  const unit = data.unit_name ?? "";
  const primary = primaryStockType(kind);
  const main = sumBuckets(data.warehouses.filter((w) => w.type_code === primary));
  const deptList = data.warehouses.filter((w) => w.type_code === "department");
  const dept = sumBuckets(deptList);
  const other = sumBuckets(data.warehouses.filter((w) => w.type_code !== "department" && w.type_code !== primary));
  const woTypes = data.write_off_types.filter((t) => t.code !== "return_supplier");
  const written = sumBuckets(woTypes);
  const ret = data.write_off_types.find((t) => t.code === "return_supplier") ?? { units: 0, value: 0, items: 0 };
  const lbl = (u: number, v?: number) => itemMode ? `${fmtUnits(u)} ${unit}` : v !== undefined ? fmtMoney(v) : fmtUnits(u);
  const common = { itemMode, unit };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-stretch">
        <Node icon={Truck} title="Поставки" bucket={data.received} cumulative {...common} />
        <Arrow label={lbl(data.received.units, data.received.value)} />
        <div className="w-full md:w-auto md:flex-1 min-w-0 flex flex-col gap-2">
          <Node icon={Warehouse} title={kind === "drug" ? "Центральная аптека" : "Общий склад"} bucket={main} stock {...common} />
          {other.units > 0 && <Node icon={Boxes} title="Другие склады" bucket={other} stock {...common} />}
        </div>
        <Arrow />
        <Node icon={Clock} title="В пути" bucket={data.in_transit} stock {...common} />
        <Arrow label={lbl(data.edges.to_departments.units)} />
        <Node icon={Building2} title="Склады отделений" bucket={dept} stock {...common}>
          {deptList.length > 0 && (
            <button type="button" onClick={() => setDeptOpen((o) => !o)} className="mt-2 flex items-center gap-1 text-xs text-primary">
              {deptOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}По отделениям
            </button>
          )}
          {deptOpen && (
            <ul className="mt-1 space-y-1 text-xs">
              {deptList.map((w) => (
                <li key={w.warehouse_id} className="flex justify-between gap-2">
                  <span className="truncate">{w.department_name || w.name}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{itemMode ? `${fmtUnits(w.units)} ${unit}` : `${w.items} поз.`} · {fmtMoney(w.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Node>
        <Arrow />
        <Node icon={UserRound} title="Введено пациенту" bucket={data.patient} cumulative {...common} />
      </div>

      <div className="flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <Undo2 className="h-4 w-4" />Возврат на склад (из отделений): {lbl(data.edges.returns_to_stock.units, data.edges.returns_to_stock.value)}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="hidden md:flex md:flex-1" />
        <Node icon={Trash2} title="Списано" bucket={written} cumulative {...common}>
          {woTypes.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {woTypes.map((t) => (
                <li key={t.code} className="flex justify-between gap-2">
                  <span className="truncate">{t.name}</span>
                  <span className="whitespace-nowrap">{itemMode ? `${fmtUnits(t.units)} ${unit}` : `${t.items} поз.`}</span>
                </li>
              ))}
            </ul>
          )}
        </Node>
        <Node icon={Undo2} title="Возврат поставщику" bucket={ret} cumulative {...common} />
        <div className="hidden md:flex md:flex-1" />
      </div>
      <p className="text-xs text-muted-foreground text-center">Списание и возврат поставщику — со склада и из отделений</p>
    </div>
  );
}
