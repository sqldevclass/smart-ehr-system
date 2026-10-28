import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInDays, format } from "date-fns";
import { BedDouble, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BedRow {
  department_id: string | null;
  department_name: string | null;
  room_id: string;
  room_name: string | null;
  room_type_name: string | null;
  capacity: number;
  bed_number: string | number;
  is_occupied: boolean;
  hospitalization_id: string | null;
  hospitalization_number: string | number | null;
  patient_id: string | null;
  patient_number: string | number | null;
  last_name: string | null;
  first_name: string | null;
  assigned_at: string | null;
}

const departmentKey = (bed: BedRow) => bed.department_id ?? "no-department";
const occupancy = (beds: BedRow[]) => {
  const occupied = beds.filter((bed) => bed.is_occupied).length;
  return { occupied, total: beds.length, percent: beds.length ? Math.round(occupied / beds.length * 100) : 0 };
};

function BedIcon({ bed, now }: { bed: BedRow; now: Date }) {
  const assigned = bed.assigned_at ? new Date(bed.assigned_at) : null;
  const days = assigned && !Number.isNaN(assigned.getTime()) ? Math.max(0, differenceInDays(now, assigned)) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`Койка ${bed.bed_number} — ${bed.is_occupied ? "занята" : "свободна"}`}
          className={cn("flex w-14 flex-col items-center gap-1 rounded-md p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            bed.is_occupied ? "bg-primary text-primary-foreground" : "border border-muted-foreground/40 text-muted-foreground",
            bed.is_occupied && days !== null && days > 7 && "ring-2 ring-primary/30 ring-offset-2 ring-offset-card")}>
          <BedDouble className="h-6 w-6" />
          <span className="text-xs">{bed.bed_number}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {bed.is_occupied ? (
          <div className="space-y-1">
            <p className="font-medium">{[bed.last_name, bed.first_name].filter(Boolean).join(" ") || "—"}</p>
            <p>ID пациента: {bed.patient_number ?? "—"}</p>
            <p>№ истории: {bed.hospitalization_number ?? "—"}</p>
            <p>Дней пребывания: {days ?? "—"}</p>
          </div>
        ) : `Койка ${bed.bed_number} — свободна`}
      </TooltipContent>
    </Tooltip>
  );
}

function RoomCard({ beds, allBeds, now }: { beds: BedRow[]; allBeds: BedRow[]; now: Date }) {
  const room = beds[0];
  if (!room) return null;
  const { occupied, total } = occupancy(allBeds);
  return (
    <div className="min-w-0 rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium break-words">{room.room_name || "Без названия"}</h3>
          {room.room_type_name && <Badge variant="secondary" className="whitespace-normal">{room.room_type_name}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{occupied}/{room.capacity}</span>
          {total > 0 && occupied === total && <Badge>Заполнена</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {[...beds].sort((a, b) => String(a.bed_number).localeCompare(String(b.bed_number), "ru", { numeric: true }))
          .map((bed) => <BedIcon key={String(bed.bed_number)} bed={bed} now={now} />)}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full sm:w-60"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export default function BedOccupancyTab() {
  const { user } = useAuth();
  const [department, setDepartment] = useState("all");
  const [room, setRoom] = useState("all");
  const [status, setStatus] = useState("all");
  const { data: beds = [], isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["bed-occupancy", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      if (!user?.hospitalId) return [];
      const { data, error } = await supabase.rpc<
        "get_bed_occupancy",
        { p_hospital_id: string },
        { Row: BedRow; Result: BedRow[]; RelationName: "get_bed_occupancy"; Relationships: [] }
      >("get_bed_occupancy", { p_hospital_id: user.hospitalId });
      if (error) throw error;
      return data ?? [];
    },
  });
  const departments = new Map<string, string>();
  const rooms = new Map<string, string>();
  const allRoomBeds = new Map<string, BedRow[]>();
  for (const bed of beds) {
    departments.set(departmentKey(bed), bed.department_name || "Без отделения");
    if (department === "all" || departmentKey(bed) === department) rooms.set(bed.room_id, bed.room_name || "Без названия");
    const roomBeds = allRoomBeds.get(bed.room_id) ?? [];
    roomBeds.push(bed);
    allRoomBeds.set(bed.room_id, roomBeds);
  }
  const filtered = beds.filter((bed) =>
    (department === "all" || departmentKey(bed) === department) && (room === "all" || bed.room_id === room) &&
    (status === "all" || (status === "occupied" ? bed.is_occupied : !bed.is_occupied)));
  const groups = new Map<string, BedRow[]>();
  for (const bed of filtered) {
    const group = groups.get(departmentKey(bed)) ?? [];
    group.push(bed);
    groups.set(departmentKey(bed), group);
  }
  const { occupied, total, percent } = occupancy(filtered);
  const now = new Date();
  const sortedOptions = (values: Map<string, string>) => [...values].sort((a, b) => a[1].localeCompare(b[1], "ru"))
    .map(([value, label]) => ({ value, label }));

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Всего коек" value={total} />
        <MetricTile label="Занято" value={occupied} />
        <MetricTile label="Свободно" value={total - occupied} />
        <MetricTile label="Загрузка %" value={`${percent}%`} />
      </SummaryCard>
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect label="Отделение" value={department} onChange={(value) => { setDepartment(value); setRoom("all"); }}
          options={[{ value: "all", label: "Все отделения" }, ...sortedOptions(departments)]} />
        <FilterSelect label="Палата" value={room} onChange={setRoom} options={[{ value: "all", label: "Все палаты" }, ...sortedOptions(rooms)]} />
        <FilterSelect label="Статус" value={status} onChange={setStatus} options={[
          { value: "all", label: "Все" }, { value: "vacant", label: "Только свободные" }, { value: "occupied", label: "Только занятые" },
        ]} />
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-sm text-muted-foreground">Данные на {dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm") : "—"}</span>
          <Button variant="outline" size="icon" aria-label="Обновить" title="Обновить" disabled={isFetching || !user?.hospitalId} onClick={() => void refetch()}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin motion-reduce:animate-none")} />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><BedDouble className="h-4 w-4 rounded-sm bg-primary text-primary-foreground" />Занято</span>
        <span className="flex items-center gap-2"><BedDouble className="h-4 w-4" />Свободно</span>
      </div>
      {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Загрузка…</p>
        : error ? <p className="py-8 text-center text-sm text-destructive" role="alert">Не удалось загрузить данные о койках.</p>
        : !filtered.length ? <p className="py-8 text-center text-sm text-muted-foreground">Нет коек, соответствующих выбранным фильтрам.</p>
        : <TooltipProvider>
          <div className="space-y-6">
            {[...groups].sort((a, b) => (departments.get(a[0]) ?? "").localeCompare(departments.get(b[0]) ?? "", "ru"))
              .map(([id, departmentBeds]) => {
                const stats = occupancy(departmentBeds);
                const roomIds = [...new Set(departmentBeds.map((bed) => bed.room_id))]
                  .sort((a, b) => (allRoomBeds.get(a)?.[0]?.room_name ?? "").localeCompare(allRoomBeds.get(b)?.[0]?.room_name ?? "", "ru", { numeric: true }));
                return (
                  <section key={id} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3 border-b pb-3">
                      <h2 className="font-semibold">{departments.get(id)}</h2>
                      <progress value={stats.occupied} max={stats.total || 1} aria-label={`Загрузка: ${departments.get(id)}`}
                        className="h-1.5 w-32 overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />
                      <span className="text-sm text-muted-foreground">{stats.occupied} / {stats.total} · {stats.percent}%</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {roomIds.map((roomId) => <RoomCard key={roomId} beds={departmentBeds.filter((bed) => bed.room_id === roomId)} allBeds={allRoomBeds.get(roomId) ?? []} now={now} />)}
                    </div>
                  </section>
                );
              })}
          </div>
        </TooltipProvider>}
    </div>
  );
}