import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ServiceResult } from "./types";

interface Props {
  physicianId: string;
  hospitalId: string;
  preselectedServiceId?: string;
  onConfirm: (services: ServiceResult[]) => void;
  onCancel: () => void;
}

export function ServicePicker({ physicianId, hospitalId, preselectedServiceId, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const autoFiredRef = useState({ done: false })[0];

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["booking-physician-services", physicianId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select("service_id, services(id, name, cost_with_vat, service_types(name_en))")
        .eq("staff_role_id", physicianId)
        .eq("hospital_id", hospitalId);
      if (error) throw error;
      return (data || [])
        .map((r: any) => r.services)
        .filter(Boolean)
        .map((s: any): ServiceResult => ({
          id: s.id,
          name: s.name,
          costWithVat: Number(s.cost_with_vat || 0),
          serviceTypeName: s.service_types?.name_en ?? null,
        }));
    },
  });

  const filtered = useMemo(() => {
    if (preselectedServiceId) return services.filter((s) => s.id === preselectedServiceId);
    return services;
  }, [services, preselectedServiceId]);

  // Auto-confirm when single option
  useEffect(() => {
    if (autoFiredRef.done || isLoading) return;
    if (filtered.length === 1) {
      autoFiredRef.done = true;
      onConfirm(filtered);
    }
  }, [filtered, isLoading, onConfirm, autoFiredRef]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading services…</p>;

  if (filtered.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">No services available for this physician.</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  if (filtered.length === 1) {
    // Will auto-confirm
    return <p className="text-sm text-muted-foreground">Preparing service…</p>;
  }

  const chosen = filtered.filter((s) => selected.has(s.id));

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Select services to book</Label>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
        {filtered.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded p-2 text-sm hover:bg-muted"
          >
            <div className="flex items-center gap-2">
              <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.serviceTypeName || "—"}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{s.costWithVat.toFixed(2)}</div>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button disabled={chosen.length === 0} onClick={() => onConfirm(chosen)}>
          Book Selected ({chosen.length})
        </Button>
      </div>
    </div>
  );
}
