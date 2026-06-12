import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, addDays, differenceInYears, isSameDay } from "date-fns";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

const STATUS_LABELS: Record<string, string> = {
  preliminary: "Предварительное",
  in_progress: "В процессе",
  ready_for_execution: "Готов к исполнению",
  completed: "Выполнен",
  cancelled: "Отменён",
  return: "Возврат",
  returned_accepted: "Обратно принято",
};

const STATUS_COLORS: Record<string, string> = {
  preliminary: "text-orange-600",
  in_progress: "text-blue-600",
  ready_for_execution: "text-emerald-600",
  completed: "text-green-700",
  cancelled: "text-gray-400",
  return: "text-red-600",
  returned_accepted: "text-gray-500",
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [actingSlot, setActingSlot] = useState<string | null>(null);

  const isToday = isSameDay(day, new Date());
  const currentHour = new Date().getHours();

  const { data: departments = [] } = useQuery({
    queryKey: ["pharm-grid-depts", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const activeDeptId = selectedDeptId ?? departments[0]?.id ?? null;

  const { data: alertSlots = [] } = useQuery({
    queryKey: ["pharm-grid-alerts", user?.hospitalId],
    enabled: !!user?.hospitalId,
    refetchInterval: 60000,
    queryFn: async () => {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, dispense_status, scheduled_at,
          drug_prescriptions!prescription_id(is_patient_own_drug),
          hospitalizations!inner(department_id)
        `)
        .eq("hospital_id", user!.hospitalId)
        .in("dispense_status", ["preliminary", "return"]);
      if (error) throw error;
      return (data || []).filter((s: any) => {
        if (s.drug_prescriptions?.is_patient_own_drug) return false;
        if (s.dispense_status === "return") return true;
        const at = new Date(s.scheduled_at);
        return at >= now && at <= inOneHour;
      });
    },
  });

  const deptDots = useMemo(() => {
    const map: Record<string, { red: boolean; orange: boolean }> = {};
    for (const s of alertSlots as any[]) {
      const deptId = s.hospitalizations?.department_id;
      if (!deptId) continue;
      if (!map[deptId]) map[deptId] = { red: false, orange: false };
      if (s.dispense_status === "preliminary") map[deptId].red = true;
      if (s.dispense_status === "return") map[deptId].orange = true;
    }
    return map;
  }, [alertSlots]);

  const dayStart = useMemo(() => {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [day]);
  const dayEnd = useMemo(() => addDays(dayStart, 1), [dayStart]);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["pharm-grid-slots", user?.hospitalId, activeDeptId, dayStart.toISOString()],
    enabled: !!user?.hospitalId && !!activeDeptId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, scheduled_at, status, dispense_status, override_dose,
          drug_prescriptions!prescription_id(
            id, dose, dose_unit, route, prescription_type, prn_condition,
            is_patient_own_drug, custom_drug_name,
            drug_formulary!drug_formulary_id(trade_name, inn)
          ),
          hospitalizations!inner(
            id, department_id,
            patients!inner(
              id, first_name, last_name, patient_number,
              date_of_birth, weight_kg, height_cm
            )
          )
        `)
        .eq("hospital_id", user!.hospitalId)
        .eq("hospitalizations.department_id", activeDeptId)
        .gte("scheduled_at", dayStart.toISOString())
        .lt("scheduled_at", dayEnd.toISOString())
        .order("scheduled_at");
      if (error) throw error;
      return data || [];
    },
  });

  const patientRows = useMemo(() => {
    const map = new Map<string, { patient: any; hospId: string; byHour: Map<number, any[]> }>();
    for (const s of slots as any[]) {
      const patient = s.hospitalizations?.patients;
      if (!patient) continue;
      const key = patient.id;
      if (!map.has(key)) {
        map.set(key, {
          patient,
          hospId: s.hospitalizations.id,
          byHour: new Map(),
        });
      }
      const hour = new Date(s.scheduled_at).getHours();
      const row = map.get(key)!;
      const arr = row.byHour.get(hour) || [];
      arr.push(s);
      row.byHour.set(hour, arr);
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.patient.last_name}`.localeCompare(`${b.patient.last_name}`)
    );
  }, [slots]);

  const handleSlotAction = async (slotId: string, newStatus: string) => {
    if (!user) return;
    setActingSlot(slotId);
    try {
      const { error } = await supabase.rpc("update_slot_status", {
        p_slot_id: slotId,
        p_hospital_id: user.hospitalId,
        p_new_status: newStatus,
        p_changed_by: user.id,
      });
      if (error) throw error;
      toast.success("Статус обновлён");
      queryClient.invalidateQueries({ queryKey: ["pharm-grid-slots"] });
      queryClient.invalidateQueries({ queryKey: ["pharm-grid-alerts"] });
    } catch (e: any) {
      toast.error(e.message || "Ошибка");
    } finally {
      setActingSlot(null);
    }
  };

  const drugName = (s: any) => {
    const p = s.drug_prescriptions;
    return p?.is_patient_own_drug
      ? p.custom_drug_name
      : p?.drug_formulary?.trade_name ?? "—";
  };

  const slotCell = (s: any) => {
    const p = s.drug_prescriptions;
    const isOwn = !!p?.is_patient_own_drug;
    const status = s.dispense_status;
    const canAct = !isOwn && (status === "preliminary" || status === "return");

    const content = (
      <div className={cn(
        "rounded border px-1.5 py-1 text-[11px] leading-tight bg-white",
        isOwn ? "border-amber-200 bg-amber-50" : "border-border hover:border-primary cursor-pointer"
      )}>
        <div className="font-medium truncate">
          {drugName(s)} {p?.dose}{p?.dose_unit ?? ""}
        </div>
        <div className="text-muted-foreground truncate">
          {p?.route} · {format(new Date(s.scheduled_at), "HH:mm")}
          {p?.prescription_type === "prn" && " · PRN"}
        </div>
        {isOwn && (
          <div className="text-[10px] text-amber-700 font-medium">
            Своё (справочно)
          </div>
        )}
        <div className={cn("text-[10px]", STATUS_COLORS[status] ?? "text-muted-foreground")}>
          {STATUS_LABELS[status] ?? status}
        </div>
      </div>
    );

    if (!canAct) return <div key={s.id}>{content}</div>;

    return (
      <Popover key={s.id}>
        <PopoverTrigger asChild>{content}</PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-2">
          <div className="text-sm font-semibold">
            {drugName(s)} {p?.dose}{p?.dose_unit ?? ""}
          </div>
          <div className="text-xs text-muted-foreground">
            {p?.route} · {format(new Date(s.scheduled_at), "dd.MM HH:mm")}
          </div>
          {status === "preliminary" && (
            <Button
              size="sm"
              className="w-full"
              disabled={actingSlot === s.id}
              onClick={() => handleSlotAction(s.id, "in_progress")}
            >
              {actingSlot === s.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : "В процессе ▶"}
            </Button>
          )}
          {status === "return" && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={actingSlot === s.id}
              onClick={() => handleSlotAction(s.id, "returned_accepted")}
            >
              {actingSlot === s.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : "Обратно принято"}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="h-full flex flex-col p-4 space-y-3 overflow-hidden">
      {/* Department tabs */}
      <div className="flex flex-wrap gap-2">
        {(departments as any[]).map((d: any) => {
          const dots = deptDots[d.id];
          return (
            <button
              key={d.id}
              onClick={() => setSelectedDeptId(d.id)}
              className={cn(
                "relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeDeptId === d.id
                  ? "bg-primary text-white"
                  : "bg-muted text-foreground hover:bg-muted/70"
              )}
            >
              {d.name}
              {dots?.red && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
              )}
              {dots?.orange && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 border border-white" style={{ right: dots.red ? "10px" : undefined }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Day navigation */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setDay(d => addDays(d, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDay(d); }}>
          Сегодня
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDay(d => addDays(d, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="text-sm text-muted-foreground">
          {format(day, "dd.MM.yyyy")}
          {isToday && <span className="text-emerald-600"> · сегодня</span>}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto border rounded">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : patientRows.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            Нет назначений на этот день
          </div>
        ) : (
          <table className="text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="border p-1.5 text-left sticky left-0 z-20 bg-white min-w-[180px]">
                  Пациент
                </th>
                {HOURS.map(h => (
                  <th
                    key={h}
                    className={cn(
                      "border p-1.5 text-center min-w-[110px] font-medium",
                      isToday && h === currentHour
                        ? "bg-emerald-100 text-emerald-700"
                        : "text-muted-foreground"
                    )}
                  >
                    {String(h).padStart(2, "0")}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patientRows.map(({ patient, byHour }) => (
                <tr key={patient.id} className="align-top">
                  <td className="border p-1.5 sticky left-0 z-10 bg-white min-w-[180px]">
                    <div className="font-medium text-sm">
                      {patient.last_name} {patient.first_name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {patient.date_of_birth
                        ? `${differenceInYears(new Date(), new Date(patient.date_of_birth))} лет`
                        : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {patient.weight_kg ? `Вес:${patient.weight_kg}кг ` : ""}
                      {patient.height_cm ? `Рост:${patient.height_cm}см` : ""}
                    </div>
                  </td>
                  {HOURS.map(h => (
                    <td
                      key={h}
                      className={cn(
                        "border p-1 align-top min-w-[110px]",
                        isToday && h === currentHour ? "bg-emerald-50/40" : ""
                      )}
                    >
                      <div className="space-y-1">
                        {(byHour.get(h) || []).map((s: any) => slotCell(s))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
