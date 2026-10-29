export type TurnoverKind = "drug" | "product";

export interface Bucket { units: number; value: number; items: number }
export interface LifecycleWarehouse extends Bucket {
  warehouse_id: string; name: string; type_code: string; department_name: string | null; is_active: boolean;
}
export interface LifecycleWriteOffType extends Bucket { code: string; name: string }
export interface Lifecycle {
  generated_at: string; kind: TurnoverKind; item_id: string | null; item_name: string | null; unit_name: string | null;
  received: Bucket; patient: Bucket; written_off: Bucket; in_transit: Bucket;
  warehouses: LifecycleWarehouse[]; write_off_types: LifecycleWriteOffType[];
  edges: { to_departments: { units: number; value: number }; returns_to_stock: { units: number; value: number } };
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const bucket = (b: any): Bucket => ({ units: n(b?.units), value: n(b?.value), items: n(b?.items) });
export const sumBuckets = (list: Bucket[]): Bucket =>
  list.reduce((a, b) => ({ units: a.units + b.units, value: a.value + b.value, items: a.items + b.items }), { units: 0, value: 0, items: 0 });

export function normalizeLifecycle(raw: any): Lifecycle {
  return {
    generated_at: raw?.generated_at ?? "", kind: raw?.kind, item_id: raw?.item_id ?? null,
    item_name: raw?.item_name ?? null, unit_name: raw?.unit_name ?? null,
    received: bucket(raw?.received), patient: bucket(raw?.patient),
    written_off: bucket(raw?.written_off), in_transit: bucket(raw?.in_transit),
    warehouses: (raw?.warehouses ?? []).map((w: any) => ({ ...w, ...bucket(w) })),
    write_off_types: (raw?.write_off_types ?? []).map((w: any) => ({ ...w, ...bucket(w) })),
    edges: {
      to_departments: { units: n(raw?.edges?.to_departments?.units), value: n(raw?.edges?.to_departments?.value) },
      returns_to_stock: { units: n(raw?.edges?.returns_to_stock?.units), value: n(raw?.edges?.returns_to_stock?.value) },
    },
  };
}

export const primaryStockType = (kind: TurnoverKind) => (kind === "drug" ? "central_pharmacy" : "general");
export const fmtUnits = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 3 });
