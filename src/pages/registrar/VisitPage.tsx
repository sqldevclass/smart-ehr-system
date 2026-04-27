import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Send, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  reservation: "bg-muted text-muted-foreground",
  preliminary: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  ready_for_execution: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function StatusBadge({ code, label }: { code?: string | null; label?: string | null }) {
  const cls = STATUS_STYLES[code || ""] || "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", cls)}>
      {label || code || "—"}
    </span>
  );
}

export default function VisitPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();

  const { data: visit, isLoading } = useQuery({
    queryKey: ["visit", visitId],
    queryFn: async () => {
      if (!visitId) return null;
      const { data, error } = await supabase
        .from("visits")
        .select(
          "*, patients(first_name, last_name, middle_name, patient_number, date_of_birth), visit_services(*, services(name, cost_with_vat), service_statuses(code, name_ru), physicians(profile_id, profiles(full_name)))"
        )
        .eq("id", visitId)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!visitId,
  });

  const { data: invoice } = useQuery({
    queryKey: ["visit-invoice", visitId],
    queryFn: async () => {
      if (!visitId) return null;
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, total_amount, amount_paid, status")
        .eq("visit_id", visitId)
        .maybeSingle();
      return data;
    },
    enabled: !!visitId,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading visit…</p>;
  }
  if (!visit) {
    return <p className="text-sm text-muted-foreground">Visit not found.</p>;
  }

  const p = visit.patients;
  const patientName = p
    ? [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ") || "—"
    : "—";

  const services: any[] = visit.visit_services || [];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/registrar")}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {/* Visit header */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground font-mono">
              Visit #{visit.visit_number || visit.id.slice(0, 8)}
            </div>
            <div className="text-lg font-semibold">{patientName}</div>
            <div className="text-sm text-muted-foreground">
              {p?.patient_number ? `Patient #${p.patient_number} · ` : ""}
              {visit.visit_date ? format(new Date(visit.visit_date), "MMM d, yyyy") : "—"}
            </div>
          </div>
          <div className="text-right space-y-1">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-lg font-semibold">{Number(visit.total_amount || 0).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">
              Paid: {Number(visit.amount_paid || 0).toFixed(2)}
            </div>
          </div>
        </div>
      </Card>

      {/* Services */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b font-semibold">Services</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Assigned Physician</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                  No services on this visit.
                </TableCell>
              </TableRow>
            ) : (
              services.map((vs: any) => (
                <TableRow key={vs.id}>
                  <TableCell className="font-medium">{vs.services?.name || "—"}</TableCell>
                  <TableCell>{vs.physicians?.profiles?.full_name || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      code={vs.service_statuses?.code}
                      label={vs.service_statuses?.name_ru}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(vs.cost_at_time ?? vs.services?.cost_with_vat ?? 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Invoice */}
      {invoice && (
        <Card className="p-4 space-y-2">
          <div className="font-semibold">Invoice</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Number</div>
              <div className="font-mono">{invoice.invoice_number || invoice.id.slice(0, 8)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Created</div>
              <div>{invoice.created_at ? format(new Date(invoice.created_at), "MMM d, yyyy") : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total</div>
              <div>{Number(invoice.total_amount || visit.total_amount || 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="capitalize">{invoice.status || "unpaid"}</div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          className="gap-2"
          onClick={() => toast.success("Patient sent to cashier.")}
        >
          <Send className="h-4 w-4" />
          Send to Cashier
        </Button>
      </div>
    </div>
  );
}
