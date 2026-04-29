import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toLocal } from "@/lib/timezone";

interface Visit {
  id: string;
  visit_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  registration_source: string | null;
  patients: {
    first_name: string;
    last_name: string;
    patient_number: string;
  } | null;
}

interface VisitServiceRow {
  id: string;
  cost_at_time: number;
  services: { name: string | null; code: string | null } | null;
  service_statuses: { code: string | null; name_en: string | null } | null;
}

interface PaymentMethod {
  id: string;
  name_en: string;
}

const fmt = (n: number) => Number(n || 0).toFixed(2);

export default function PaymentsPage() {
  const { user } = useAuth();
  const [outstanding, setOutstanding] = useState<Visit[]>([]);
  const [paidToday, setPaidToday] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogVisit, setDialogVisit] = useState<Visit | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [outRes, paidRes] = await Promise.all([
      supabase
        .from("visits")
        .select(
          "id, visit_date, total_amount, amount_paid, status, registration_source, patients(first_name, last_name, patient_number)"
        )
        .eq("hospital_id", user.hospitalId)
        .in("status", ["unpaid", "partial"])
        .order("created_at", { ascending: false }),
      supabase
        .from("visits")
        .select(
          "id, visit_date, total_amount, amount_paid, status, registration_source, patients(first_name, last_name, patient_number)"
        )
        .eq("hospital_id", user.hospitalId)
        .eq("status", "paid")
        .eq("visit_date", today)
        .order("created_at", { ascending: false }),
    ]);

    if (outRes.error) toast.error(outRes.error.message);
    if (paidRes.error) toast.error(paidRes.error.message);

    setOutstanding((outRes.data ?? []) as any);
    setPaidToday((paidRes.data ?? []) as any);
    setLoading(false);
  }, [user, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const renderRow = (v: Visit, withPay: boolean) => {
    const outstandingAmt = Number(v.total_amount || 0) - Number(v.amount_paid || 0);
    return (
      <TableRow key={v.id}>
        <TableCell className="font-medium">
          {v.patients ? `${v.patients.last_name} ${v.patients.first_name}` : "—"}
        </TableCell>
        <TableCell>{v.patients?.patient_number ?? "—"}</TableCell>
        <TableCell>{v.visit_date ? toLocal(`${v.visit_date}T00:00:00Z`, user?.timezone || "Asia/Tashkent", "MMM d, yyyy") : "—"}</TableCell>
        <TableCell>{fmt(v.total_amount)}</TableCell>
        <TableCell>{fmt(v.amount_paid)}</TableCell>
        <TableCell className="font-semibold">{fmt(outstandingAmt)}</TableCell>
        <TableCell>
          <Badge variant={v.status === "paid" ? "default" : "secondary"}>{v.status}</Badge>
        </TableCell>
        {withPay && (
          <TableCell>
            <Button size="sm" onClick={() => setDialogVisit(v)}>
              Pay
            </Button>
          </TableCell>
        )}
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">Process visit payments and view today's collections.</p>
      </div>

      <Tabs defaultValue="outstanding">
        <TabsList>
          <TabsTrigger value="outstanding">Outstanding ({outstanding.length})</TabsTrigger>
          <TabsTrigger value="paid">Paid Today ({paidToday.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding">
          <Card>
            <CardHeader>
              <CardTitle>Unpaid & Partial Visits</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : outstanding.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outstanding visits.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Patient #</TableHead>
                      <TableHead>Visit Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{outstanding.map((v) => renderRow(v, true))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card>
            <CardHeader>
              <CardTitle>Paid Today</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : paidToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No paid visits today.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Patient #</TableHead>
                      <TableHead>Visit Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{paidToday.map((v) => renderRow(v, false))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PaymentDialog
        visit={dialogVisit}
        onClose={() => setDialogVisit(null)}
        onPaid={() => {
          setDialogVisit(null);
          loadData();
        }}
      />
    </div>
  );
}

function PaymentDialog({
  visit,
  onClose,
  onPaid,
}: {
  visit: Visit | null;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { user } = useAuth();
  const [services, setServices] = useState<VisitServiceRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visit || !user) return;

    const outstanding = Number(visit.total_amount || 0) - Number(visit.amount_paid || 0);
    setAmount(outstanding.toFixed(2));

    (async () => {
      const [vsRes, pmRes] = await Promise.all([
        supabase
          .from("visit_services")
          .select("id, cost_at_time, services(name, code), service_statuses(code, name_en)")
          .eq("visit_id", visit.id),
        supabase
          .from("payment_methods")
          .select("id, name_en")
          .eq("is_active", true)
          .order("name_en"),
      ]);
      if (vsRes.error) toast.error(vsRes.error.message);
      if (pmRes.error) toast.error(pmRes.error.message);
      setServices((vsRes.data ?? []) as any);
      setMethods((pmRes.data ?? []) as any);
      if (pmRes.data && pmRes.data.length > 0) setMethodId(pmRes.data[0].id);
    })();
  }, [visit, user]);

  const handleConfirm = async () => {
    if (!visit || !user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (!methodId) {
      toast.error("Select a payment method.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("process_payment", {
      p_visit_id: visit.id,
      p_amount: amt,
      p_payment_method_id: methodId,
      p_received_by: user.id,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const receipt = (data as any)?.receipt_number ?? "—";
    toast.success(`Payment received. Receipt #${receipt}`);
    toast(`Print receipt: ${receipt}`);
    onPaid();
  };

  if (!visit) return null;

  const outstanding = Number(visit.total_amount || 0) - Number(visit.amount_paid || 0);

  return (
    <Dialog open={!!visit} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Process Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded border bg-muted/30 p-3 text-sm">
            <div className="font-medium">
              {visit.patients
                ? `${visit.patients.last_name} ${visit.patients.first_name}`
                : "—"}{" "}
              <span className="text-muted-foreground">({visit.patients?.patient_number})</span>
            </div>
            <div className="mt-1 text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{fmt(visit.total_amount)}</span>{" "}
              · Paid: <span className="font-semibold text-foreground">{fmt(visit.amount_paid)}</span>{" "}
              · Outstanding: <span className="font-semibold text-foreground">{fmt(outstanding)}</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Services</Label>
            <div className="max-h-48 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No services.
                      </TableCell>
                    </TableRow>
                  ) : (
                    services.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.services?.name ?? s.services?.code ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {s.service_statuses?.name_en ?? s.service_statuses?.code ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmt(s.cost_at_time)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="method">Payment Method</Label>
              <Select value={methodId} onValueChange={setMethodId}>
                <SelectTrigger id="method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Processing…" : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
