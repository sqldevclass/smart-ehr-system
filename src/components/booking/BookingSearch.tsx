import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { PhysicianResult, ServiceResult } from "./types";

interface Props {
  hospitalId: string;
  onPhysicianSelect: (p: PhysicianResult) => void;
  onServiceSelect: (s: ServiceResult) => void;
  disabled?: boolean;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function deriveScheduleType(rows: any[] | null | undefined): "slots" | "queue" | null {
  if (!rows || rows.length === 0) return null;
  const today = new Date().toISOString().split("T")[0];
  const dow = new Date().getDay();
  const active = rows.find((r) => {
    const fromOk = !r.valid_from || r.valid_from <= today;
    const toOk = !r.valid_to || r.valid_to >= today;
    const dayOk = !r.days_of_week || r.days_of_week.length === 0 || r.days_of_week.includes(dow);
    return fromOk && toOk && dayOk;
  });
  return (active?.schedule_type as "slots" | "queue" | null) ?? (rows[0].schedule_type ?? null);
}

export function BookingSearch({ hospitalId, onPhysicianSelect, onServiceSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 300);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const enabled = debounced.trim().length >= 2;

  const { data: physicians = [] } = useQuery({
    queryKey: ["booking-search-physicians", hospitalId, debounced],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physicians")
        .select("id, specialization, profiles!inner(full_name), physician_schedules(schedule_type, valid_from, valid_to, days_of_week)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .ilike("profiles.full_name", `%${debounced}%`)
        .limit(8);
      if (error) throw error;
      return (data || []).map((p: any): PhysicianResult => ({
        id: p.id,
        fullName: p.profiles?.full_name || "—",
        specialization: p.specialization,
        scheduleType: deriveScheduleType(p.physician_schedules),
      }));
    },
    enabled,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["booking-search-services", hospitalId, debounced],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_types(name_en)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .ilike("name", `%${debounced}%`)
        .limit(8);
      if (error) throw error;
      return (data || []).map((s: any): ServiceResult => ({
        id: s.id,
        name: s.name,
        costWithVat: Number(s.cost_with_vat || 0),
        serviceTypeName: s.service_types?.name_en ?? null,
      }));
    },
    enabled,
  });

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          disabled={disabled}
          placeholder="Search physician or service…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="pl-9"
        />
      </div>
      {open && enabled && (physicians.length > 0 || services.length > 0) && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {physicians.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Physicians</div>
              {physicians.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onPhysicianSelect(p); setOpen(false); setQuery(""); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.fullName}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.specialization || "—"}</div>
                    </div>
                    {p.scheduleType && (
                      <Badge variant={p.scheduleType === "slots" ? "default" : "secondary"} className="shrink-0 capitalize">
                        {p.scheduleType}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {services.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Services</div>
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onServiceSelect(s); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.serviceTypeName || "—"}</div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">{s.costWithVat.toFixed(2)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
