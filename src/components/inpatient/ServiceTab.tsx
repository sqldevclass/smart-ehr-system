import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  userId: string;
  typeCode: "laboratory" | "consultation";
  title: string;
  readOnly?: boolean;
}

export default function ServiceTab({
  hospitalizationId, patientId, hospitalId, userId, typeCode, title, readOnly,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["inpatient-services", typeCode, hospitalizationId, patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, created_at, status_id,
          services!inner(name, service_type_id, service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .eq("source", "physician")
        .order("created_at", { ascending: false });
      return (data || []).filter(
        (vs: any) =>
          vs.services?.service_types?.code === typeCode &&
          ["ready_for_execution", "in_progress", "completed"].includes(
            vs.service_statuses?.code
          )
      );
    },
    enabled: !!patientId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-services", typeCode, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, service_type_id, service_types!inner(code)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return (data || []).filter(
        (s: any) => s.service_types?.code === typeCode
      );
    },
    enabled: !readOnly,
  });

  const handleOrder = async () => {
    if (!selectedServiceId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("inpatient_order_service", {
        p_hospitalization_id: hospitalizationId,
        p_patient_id: patientId,
        p_hospital_id: hospitalId,
        p_service_id: selectedServiceId,
        p_ordered_by: userId,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Назначено");
      setSelectedServiceId("");
      queryClient.invalidateQueries({ queryKey: ["inpatient-services", typeCode] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">{title}</h3>

      {!readOnly && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите услугу" />
            </SelectTrigger>
            <SelectContent>
              {catalog.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleOrder} disabled={!selectedServiceId || submitting}>
              {submitting ? "..." : "Назначить"}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет назначений.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((vs: any) => (
            <li key={vs.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <div>
                <div className="font-medium">{vs.services?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(vs.created_at), "dd.MM.yyyy HH:mm")}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-muted">
                {vs.service_statuses?.name_ru || vs.service_statuses?.code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
