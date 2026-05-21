import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LabResultsButton } from "@/components/lab/LabResultsButton";

interface Props {
  mainServices: any[];
  childServices: any[];
  pendingOrders: any[];
  physicianNameMap: Record<string, string>;
  isReadOnly: boolean;
  patientId: string;
  hospitalId: string;
  visitId: string;
  visitServiceId: string;
  onOrderCreated: () => void;
}

export default function AssignmentsSection({
  mainServices, childServices, pendingOrders, physicianNameMap,
  isReadOnly, patientId, hospitalId, visitId, visitServiceId, onOrderCreated,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();



  const groups = useMemo(() => {
    const out: Record<string, any[]> = { laboratory: [], consultation: [], other: [] };
    const physicianOrders = [...childServices, ...pendingOrders];
    for (const vs of physicianOrders) {
      const code = vs.services?.service_types?.code;
      if (code === "laboratory") out.laboratory.push(vs);
      else if (code === "consultation") out.consultation.push(vs);
      else out.other.push(vs);
    }
    return out;
  }, [childServices, pendingOrders]);

  const { data: availableServices = [] } = useQuery({
    queryKey: ["services-for-ordering", hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_types!inner(code, name_ru)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const [showOrderForm, setShowOrderForm] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [isOrdering, setIsOrdering] = useState(false);

  const handleOrder = async () => {
    if (!selectedServiceId) return;
    setIsOrdering(true);
    const service = availableServices.find((s: any) => s.id === selectedServiceId);
    await supabase.rpc("physician_order_services", {
      p_patient_id: patientId,
      p_hospital_id: hospitalId,
      p_ordered_by: user!.id,
      p_source_visit_service_id: visitServiceId,
      p_services: [{
        service_id: selectedServiceId,
        cost_at_time: service?.cost_with_vat ?? 0,
      }],
    });
    setIsOrdering(false);
    setShowOrderForm(null);
    setSelectedServiceId("");
    queryClient.invalidateQueries({ queryKey: ["visit-services", visitId] });
    onOrderCreated();
  };

  const renderOrderForm = (kind: string) => {
    if (showOrderForm !== kind) return null;
    return (
      <div className="mt-3 p-3 border rounded-md bg-gray-50 space-y-2">
        <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
          <SelectTrigger>
            <SelectValue placeholder="Выберите услугу" />
          </SelectTrigger>
          <SelectContent>
            {availableServices
              .filter((s: any) => {
                if (kind === "lab") return s.service_types?.code === "laboratory";
                if (kind === "consultation") return s.service_types?.code === "consultation";
                return !["laboratory", "consultation"].includes(s.service_types?.code);
              })
              .map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button size="sm" disabled={!selectedServiceId || isOrdering} onClick={handleOrder}>
            {isOrdering ? "..." : "Назначить"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowOrderForm(null);
              setSelectedServiceId("");
            }}
          >
            Отмена
          </Button>
        </div>
      </div>
    );
  };

  const renderTable = (list: any[], groupKey?: string) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Услуга</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Врач</TableHead>
            <TableHead>Время</TableHead>
            <TableHead>Завершено</TableHead>
            {groupKey === "laboratory" && <TableHead>Действия</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((vs) => (
            <TableRow key={vs.id}>
              <TableCell className="font-medium">{vs.services?.name}</TableCell>
              <TableCell>
                <span className="text-xs rounded border px-2 py-0.5 bg-muted">
                  {vs.service_statuses?.name_ru}
                </span>
              </TableCell>
              <TableCell className="text-sm">
                {vs.assigned_physician_id
                  ? physicianNameMap[vs.assigned_physician_id] ?? "—"
                  : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {vs.scheduled_at
                  ? format(new Date(vs.scheduled_at), "dd.MM HH:mm")
                  : vs.queue_number
                  ? `#${vs.queue_number}`
                  : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {vs.completed_at
                  ? format(new Date(vs.completed_at), "dd.MM.yyyy HH:mm")
                  : "—"}
              </TableCell>
              {groupKey === "laboratory" && (
                <TableCell>
                  {vs.service_statuses?.code === "completed" && (
                    <LabResultsButton
                      visitServiceId={vs.id}
                      variant="indicator"
                    />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderGroup = (
    key: string,
    name: string,
    list: any[],
    addBtn: { kind: string; label: string } | null,
  ) => {
    if (list.length === 0 && (isReadOnly || !addBtn)) return null;
    return (
      <div key={key} className="space-y-2">
        <h3 className="font-heading text-base font-semibold">{name}</h3>
        {list.length > 0 && renderTable(list, key)}
        {!isReadOnly && addBtn && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setShowOrderForm(addBtn.kind)}
            >
              {addBtn.label}
            </Button>
            {renderOrderForm(addBtn.kind)}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="document-section-page space-y-6">
      {mainServices.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-heading text-lg font-semibold border-b pb-2">Назначения</h2>
          {renderTable(mainServices)}
        </div>
      )}
      {renderGroup("laboratory", "Лаборатория", groups.laboratory, {
        kind: "lab", label: "+ Направить в лабораторию",
      })}
      {renderGroup("consultation", "Консультации", groups.consultation, {
        kind: "consultation", label: "+ Направить на консультацию",
      })}
      {renderGroup("other", "Услуги", groups.other, {
        kind: "service", label: "+ Добавить услугу",
      })}

      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Медикаменты — доступно в Фазе 6
      </div>
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Уход — доступно в Фазе 9
      </div>
    </div>
  );
}
