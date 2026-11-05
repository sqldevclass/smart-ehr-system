import { cn } from "@/lib/utils";
import type { BlockCounts, FloorCounts } from "./useClinicStructure";

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = Math.abs(n) % 10, m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

interface Props { counts?: FloorCounts | BlockCounts; showFloors?: boolean; className?: string }

export function StructureCounts({ counts, showFloors, className }: Props) {
  const c = counts ?? { departments: 0, rooms: 0, beds: 0 };
  const floors = "floors" in c ? (c as BlockCounts).floors : 0;
  const parts = [
    ...(showFloors ? [`${floors} ${pluralRu(floors, "этаж", "этажа", "этажей")}`] : []),
    `${c.departments} ${pluralRu(c.departments, "отделение", "отделения", "отделений")}`,
    `${c.rooms} ${pluralRu(c.rooms, "палата", "палаты", "палат")}`,
    `${c.beds} ${pluralRu(c.beds, "койка", "койки", "коек")}`,
  ];
  return <span className={cn("text-xs font-normal text-muted-foreground", className)}>{parts.join(" · ")}</span>;
}
