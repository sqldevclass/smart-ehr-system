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
  const qc = useQueryClient();

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types-lab", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_types")
        .select("id, code")
        .or(`hospital_id.is.null,hospital_id.eq.${user!.hospitalId}`);
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
        .select("id, scheduled_at, visit_id, patient_id, patients(first_name, last_name, patient_number, date_of_birth), services(id, name, service_type_id, service_group_id, service_groups(name, color)), service_statuses(code)")
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

  const labServiceIds = useMemo(
    () => labServices.map((vs: any) => vs.id),
    [labServices],
  );

  const clusteredQueue = useMemo(() => {
    const groups = new Map<string, any[]>();
    const solo: any[] = [];
    for (const vs of labServices as any[]) {
      const color = vs.services?.service_groups?.color;
      if (!color) { solo.push(vs); continue; }
      const key = `${vs.patient_id}::${color}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(vs);
    }
    return { groups: Array.from(groups.values()), solo };
  }, [labServices]);

  const { data: existingSampleLinks = [] } = useQuery({
    queryKey: ["lab-sample-links-for-queue", labServiceIds],
    enabled: labServiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_sample_services")
        .select("visit_service_id, lab_samples!inner(id, status, barcode)")
        .in("visit_service_id", labServiceIds);
      if (error) throw error;
      return data || [];
    },
  });

  const sampleByVisitService = useMemo(() => {
    const map: Record<string, any> = {};
    for (const link of existingSampleLinks as any[]) {
      map[link.visit_service_id] = link.lab_samples;
    }
    return map;
  }, [existingSampleLinks]);

  const [drawOpen, setDrawOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [receiving, setReceiving] = useState<string | null>(null);

  const openDraw = (vs: any) => {
    setSelected(vs);
    setDrawOpen(true);
  };

  const handleReceive = async (vs: any, sample: any) => {
    setReceiving(vs.id);
    try {
      const { data: inProgressStatus } = await supabase
        .from("service_statuses")
        .select("id")
        .eq("code", "in_progress")
        .single();
      const { error: sampleErr } = await supabase
        .from("lab_samples")
        .update({ status: "in_progress" })
        .eq("id", sample.id);
      if (sampleErr) throw sampleErr;

      const { data: links } = await supabase
        .from("lab_sample_services")
        .select("visit_service_id")
        .eq("sample_id", sample.id);
      const idsToUpdate = (links || []).map((l: any) => l.visit_service_id);

      if (inProgressStatus && idsToUpdate.length > 0) {
        const { error: vsErr } = await supabase
          .from("visit_services")
          .update({ status_id: inProgressStatus.id })
          .in("id", idsToUpdate);
        if (vsErr) throw vsErr;
      }
      toast.success(`Sample received: ${sample.barcode}`);
      qc.invalidateQueries({ queryKey: ["lab-blood-draw"] });
      qc.invalidateQueries({ queryKey: ["lab-sample-links-for-queue"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReceiving(null);
    }
  };

  // Flatten to render: clustered groups first, then solo rows
  const rows: Array<{ items: any[]; isCluster: boolean; color?: string }> = [
    ...clusteredQueue.groups.map((items) => ({
      items,
      isCluster: true,
      color: items[0].services?.service_groups?.color,
    })),
    ...clusteredQueue.solo.map((vs) => ({ items: [vs], isCluster: false })),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Blood Draw</h1>

      <div className="rounded-lg border bg-card overflow-x-auto">
        {rows.length === 0 ? (
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
              {rows.map((row, i) => {
                const first = row.items[0];
                const p = first.patients;
                // For clusters: find any existing sample linked to any item
                const existingSample = row.items
                  .map((it: any) => sampleByVisitService[it.id])
                  .find(Boolean);
                const clusterName = row.items
                  .map((it: any) => it.services?.name)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <TableRow key={row.items.map((it: any) => it.id).join("|")}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {[p?.last_name, p?.first_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p?.patient_number || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {row.color && (
                          <span
                            className="inline-block h-3 w-3 rounded-full border"
                            style={{ backgroundColor: row.color }}
                          />
                        )}
                        <span>{clusterName || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{first.scheduled_at ? format(new Date(first.scheduled_at), "MMM d HH:mm") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {existingSample ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={receiving === first.id}
                          onClick={() => handleReceive(first, existingSample)}
                        >
                          {receiving === first.id ? "..." : `Receive (${existingSample.barcode})`}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => openDraw(first)}>Draw Sample</Button>
                      )}
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
        hospitalId={user!.hospitalId}
      />
    </div>
  );
}
