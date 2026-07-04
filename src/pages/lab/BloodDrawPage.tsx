import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import DrawSampleDialog from "@/components/shared/DrawSampleDialog";

export default function BloodDrawPage() {
  const { user } = useAuth();

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types-lab", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_types")
        .select("id, code")
        .eq("hospital_id", user!.hospitalId);
      return data || [];
    },
    enabled: !!user,
  });
  const labTypeIds = useMemo(
    () => serviceTypes.filter((t: any) => t.code === "laboratory").map((t: any) => t.id),
    [serviceTypes],
  );

  const { data: statuses = [] } = useQuery({
    queryKey: ["service-statuses-lab"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_statuses")
        .select("id, code")
        .eq("code", "ready_for_execution");
      return data || [];
    },
  });
  const readyId = statuses.find((s: any) => s.code === "ready_for_execution")?.id;

  const { data: rawServices = [] } = useQuery({
    queryKey: ["lab-blood-draw", user?.hospitalId, readyId],
    queryFn: async () => {
      if (!readyId) return [];
      const { data, error } = await supabase
        .from("visit_services")
        .select("id, scheduled_at, visit_id, patient_id, patients(first_name, last_name, patient_number, date_of_birth), services(id, name, service_type_id), service_statuses(code)")
        .eq("hospital_id", user!.hospitalId)
        .eq("status_id", readyId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!readyId,
  });

  const labServices = useMemo(
    () => rawServices.filter((vs: any) => labTypeIds.includes(vs.services?.service_type_id)),
    [rawServices, labTypeIds],
  );

  const [drawOpen, setDrawOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const openDraw = (vs: any) => {
    setSelected(vs);
    setDrawOpen(true);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Blood Draw</h1>

      <div className="rounded-lg border bg-card overflow-x-auto">
        {labServices.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No lab services awaiting blood draw.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Patient #</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labServices.map((vs: any, i: number) => {
                const p = vs.patients;
                return (
                  <TableRow key={vs.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {[p?.last_name, p?.first_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p?.patient_number || "—"}</TableCell>
                    <TableCell>{vs.services?.name || "—"}</TableCell>
                    <TableCell>{vs.scheduled_at ? format(new Date(vs.scheduled_at), "MMM d HH:mm") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => openDraw(vs)}>Draw Sample</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <DrawSampleDialog
        open={drawOpen}
        onOpenChange={setDrawOpen}
        visitService={selected}
        barcodePrefix="LAB"
        sampleStatus="in_progress"
      />
    </div>
  );
}
