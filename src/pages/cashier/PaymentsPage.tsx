import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
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
import { PeriodFilter, PeriodState, getDateBounds, getTodayBounds, SummaryCard, MetricTile } from "@/components/shared/PeriodFilter";
import EWSStatusDot from "@/components/ews/EWSStatusDot";

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
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [periodState, setPeriodState] = useState<PeriodState>({ period: "today" });
  const [summary, setSummary] = useState<{
    collected: number; outstanding: number; paidCount: number; unpaidCount: number;
  } | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const bounds = getDateBounds(periodState);

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
        .gte("created_at", bounds.from)
        .lte("created_at", bounds.to)
        .order("created_at", { ascending: false }),
      supabase
        .from("visits")
        .select(
          "id, visit_date, total_amount, amount_paid, status, registration_source, patients(first_name, last_name, patient_number)"
        )
        .eq("hospital_id", user.hospitalId)
        .eq("status", "paid")
        .gte("created_at", bounds.from)
        .lte("created_at", bounds.to)
        .order("created_at", { ascending: false }),
    ]);

    if (outRes.error) toast.error(outRes.error.message);
    if (paidRes.error) toast.error(paidRes.error.message);

    setOutstanding((outRes.data ?? []) as any);
    setPaidToday((paidRes.data ?? []) as any);
    setLoading(false);
  }, [user, bounds.from, bounds.to]);

  const loadSummary = useCallback(async () => {
    if (!user) return;
    const t = getTodayBounds();
    const [collectedRes, todayUnpaidRes, todayPaidRes] = await Promise.all([
      supabase.from("payments")
        .select("amount")
        .eq("hospital_id", user.hospitalId)
        .gte("paid_at", t.from).lte("paid_at", t.to),
      supabase.from("visits")
        .select("total_amount, amount_paid")
        .eq("hospital_id", user.hospitalId)
        .in("status", ["unpaid", "partial"])
        .eq("visit_date", today),
      supabase.from("visits")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", user.hospitalId)
        .eq("status", "paid")
        .eq("visit_date", today),
    ]);
    const collected = (collectedRes.data || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const outstandingAmt = (todayUnpaidRes.data || []).reduce(
      (s: number, v: any) => s + (Number(v.total_amount || 0) - Number(v.amount_paid || 0)), 0
    );
    setSummary({
      collected,
      outstanding: outstandingAmt,
      paidCount: todayPaidRes.count || 0,
      unpaidCount: (todayUnpaidRes.data || []).length,
    });
  }, [user, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const { data: patientResults = [] } = useQuery({
    queryKey: ["cashier-patient-search", user?.hospitalId, patientSearch],
    enabled: !!user && patientSearch.trim().length > 1,
    queryFn: async () => {
      const s = `%${patientSearch.trim()}%`;
      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_number, first_name, last_name, date_of_birth")
        .eq("hospital_id", user!.hospitalId)
        .or(`last_name.ilike.${s},first_name.ilike.${s},patient_number.ilike.${s}`)
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const renderRow = (v: Visit, withPay: boolean, idx: number) => {
    const outstandingAmt = Number(v.total_amount || 0) - Number(v.amount_paid || 0);
    return (
      <TableRow key={v.id}>
        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
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

      <SummaryCard>
        <MetricTile label="Collected Today" value={fmt(summary?.collected ?? 0)} highlight />
        <MetricTile label="Outstanding Today" value={fmt(summary?.outstanding ?? 0)} />
        <MetricTile label="Paid Visits Today" value={summary?.paidCount ?? "—"} />
        <MetricTile label="Unpaid Visits Today" value={summary?.unpaidCount ?? "—"} />
      </SummaryCard>

      <PeriodFilter value={periodState} onChange={setPeriodState} />

      <Card>
        <CardHeader>
          <CardTitle>Стационарные платежи</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Input
              placeholder="Поиск пациента (ФИО или П#)…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
            {patientSearch.trim().length > 1 && patientResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded border bg-popover shadow">
                {patientResults.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setSelectedPatient(p);
                      setPatientSearch("");
                    }}
                  >
                    <span className="font-medium">{p.last_name} {p.first_name}</span>
                    <span className="ml-2 text-muted-foreground">П# {p.patient_number}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedPatient && user && (
            <PatientBillingPanel
              patient={selectedPatient}
              hospitalId={user.hospitalId}
              onClose={() => setSelectedPatient(null)}
            />
          )}
        </CardContent>
      </Card>


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
                      <TableHead className="w-12">#</TableHead>
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
                  <TableBody>{outstanding.map((v, i) => renderRow(v, true, i))}</TableBody>
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
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Patient #</TableHead>
                      <TableHead>Visit Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{paidToday.map((v, i) => renderRow(v, false, i))}</TableBody>
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

function PatientBillingPanel({
  patient,
  hospitalId,
  onClose,
}: {
  patient: any;
  hospitalId: string;
  onClose: () => void;
}) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  const { data: balance = 0, refetch: refetchBalance } = useQuery({
    queryKey: ["patient-deposit-balance", patient.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_patient_deposit_balance", {
        p_patient_id: patient.id,
      });
      if (error) throw error;
      return data as number;
    },
  });

  const { data: latestInvoice, refetch: refetchLatestInvoice } = useQuery({
    queryKey: ["patient-latest-invoice", patient.id, hospitalId],
    queryFn: async () => {
      const { data: hosp } = await supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, discharged_at")
        .eq("patient_id", patient.id)
        .eq("hospital_id", hospitalId)
        .order("admitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!hosp) return null;

      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at")
        .eq("hospitalization_id", hosp.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!invoice) return null;

      return { hospitalization: hosp, invoice };
    },
  });

  const { data: totalOutstanding = 0, refetch: refetchOutstanding } = useQuery({
    queryKey: ["patient-total-outstanding", patient.id],
    queryFn: async () => {
      const { data: hosps } = await supabase
        .from("hospitalizations")
        .select("id")
        .eq("patient_id", patient.id);
      const hospIds = (hosps || []).map((h: any) => h.id);
      if (hospIds.length === 0) return 0;

      const { data: confirmedInvoices, error } = await supabase
        .from("invoices")
        .select("id")
        .in("hospitalization_id", hospIds)
        .eq("status", "confirmed");
      if (error) throw error;

      let total = 0;
      for (const inv of confirmedInvoices || []) {
        const { data } = await supabase.rpc("get_invoice_balance", { p_invoice_id: inv.id });
        total += Number((data as any[])?.[0]?.remaining_amount || 0);
      }
      return total;
    },
  });

  const refetchAll = () => {
    refetchBalance();
    refetchLatestInvoice();
    refetchOutstanding();
  };

  return (
    <div className="rounded border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium flex items-center gap-2">
          <span>{patient.last_name} {patient.first_name} · П# {patient.patient_number}</span>
          {totalOutstanding > 0 && <EWSStatusDot status="overdue" />}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Закрыть</Button>
      </div>
      <div className="text-sm">
        Баланс аванса: <span className="font-semibold">{Number(balance).toFixed(2)}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowDeposit(true)}>+ Принять аванс</Button>
        {latestInvoice && (
          <Button size="sm" variant="secondary" onClick={() => setShowInvoice(true)}>
            Создать Счет-фактура
          </Button>
        )}
      </div>
      <DebtSection
        patient={patient}
        hospitalId={hospitalId}
        onChanged={refetchAll}
      />
      <HistorySection patient={patient} />
      <DepositDialog
        open={showDeposit}
        patient={patient}
        hospitalId={hospitalId}
        onClose={() => setShowDeposit(false)}
        onSaved={() => {
          setShowDeposit(false);
          refetchBalance();
        }}
      />
      {latestInvoice && (
        <InvoiceDialog
          open={showInvoice}
          patient={patient}
          hospitalId={hospitalId}
          hospitalizationId={latestInvoice.hospitalization.id}
          invoiceId={latestInvoice.invoice.id}
          onClose={() => setShowInvoice(false)}
          onConfirmed={() => {
            setShowInvoice(false);
            refetchAll();
          }}
        />
      )}
    </div>
  );
}

function DebtSection({
  patient, hospitalId, onChanged,
}: { patient: any; hospitalId: string; onChanged: () => void }) {
  const { user } = useAuth();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodByInvoice, setMethodByInvoice] = useState<Record<string, string>>({});

  const { data: debts = [], refetch } = useQuery({
    queryKey: ["patient-debt-invoices", patient.id],
    queryFn: async () => {
      const { data: hosps, error: hErr } = await supabase
        .from("hospitalizations")
        .select("id")
        .eq("patient_id", patient.id);
      if (hErr) throw hErr;
      const hospIds = (hosps || []).map((h: any) => h.id);
      if (hospIds.length === 0) return [];

      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, hospitalization_id, hospitalizations(hospitalization_number, discharged_at)")
        .in("hospitalization_id", hospIds)
        .eq("status", "confirmed");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: balances = {} } = useQuery({
    queryKey: ["patient-debt-balances", (debts as any[]).map((d: any) => d.id)],
    enabled: (debts as any[]).length > 0,
    queryFn: async () => {
      const result: Record<string, any> = {};
      for (const d of debts as any[]) {
        const { data } = await supabase.rpc("get_invoice_balance", { p_invoice_id: d.id });
        result[d.id] = (data as any[])[0];
      }
      return result;
    },
  });

  useEffect(() => {
    supabase.from("payment_methods").select("id, name_en")
      .eq("is_active", true).order("name_en")
      .then(({ data }) => setMethods((data ?? []) as any));
  }, []);

  const handlePay = async (invoiceId: string, hospitalizationId: string) => {
    const methodId = methodByInvoice[invoiceId];
    setPayingId(invoiceId);
    const { error } = await supabase.rpc("pay_hospitalization_invoice", {
      p_invoice_id: invoiceId,
      p_hospital_id: hospitalId,
      p_patient_id: patient.id,
      p_hospitalization_id: hospitalizationId,
      p_payment_method_id: methodId || null,
      p_received_by: user!.id,
    });
    setPayingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Счёт оплачен.");
    refetch();
    onChanged();
  };

  const handleCancel = async (invoiceId: string) => {
    setCancelingId(invoiceId);
    const { error } = await supabase.rpc("cancel_hospitalization_invoice", {
      p_invoice_id: invoiceId,
      p_cancelled_by: user!.id,
    });
    setCancelingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Счёт отменён.");
    refetch();
    onChanged();
  };

  if ((debts as any[]).length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-sm font-semibold">Долг</div>
      {(debts as any[]).map((d: any) => {
        const bal = (balances as any)[d.id];
        const isActive = !d.hospitalizations?.discharged_at;
        return (
          <div key={d.id} className="rounded border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>
                Госпитализация № {d.hospitalizations?.hospitalization_number} · Счёт № {d.invoice_number}
              </span>
              <span className="font-semibold">{Number(bal?.remaining_amount || 0).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={methodByInvoice[d.id] || ""}
                onValueChange={(v) => setMethodByInvoice((prev) => ({ ...prev, [d.id]: v }))}
              >
                <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Способ оплаты" /></SelectTrigger>
                <SelectContent>
                  {methods.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => handlePay(d.id, d.hospitalization_id)}
                disabled={payingId === d.id}
              >
                {payingId === d.id ? "..." : "Оплатить"}
              </Button>
              {isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancel(d.id)}
                  disabled={cancelingId === d.id}
                >
                  {cancelingId === d.id ? "..." : "Отменить"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistorySection({ patient }: { patient: any }) {
  const { data: history = [] } = useQuery({
    queryKey: ["patient-history-invoices", patient.id],
    queryFn: async () => {
      const { data: hosps, error: hErr } = await supabase
        .from("hospitalizations")
        .select("id")
        .eq("patient_id", patient.id);
      if (hErr) throw hErr;
      const hospIds = (hosps || []).map((h: any) => h.id);
      if (hospIds.length === 0) return [];

      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, hospitalizations(hospitalization_number)")
        .in("hospitalization_id", hospIds)
        .eq("status", "paid")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if ((history as any[]).length === 0) return null;

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-sm font-semibold">История</div>
      {(history as any[]).map((h: any) => (
        <div key={h.id} className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Госпитализация № {h.hospitalizations?.hospitalization_number} · Счёт № {h.invoice_number}</span>
          <span>{format(new Date(h.created_at), "dd.MM.yyyy")}</span>
        </div>
      ))}
    </div>
  );
}

function DepositDialog({
  open, patient, hospitalId, onClose, onSaved,
}: {
  open: boolean; patient: any; hospitalId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    supabase.from("payment_methods").select("id, name_en")
      .eq("is_active", true).order("name_en")
      .then(({ data }) => {
        setMethods((data ?? []) as any);
        if (data && data.length > 0) setMethodId(data[0].id);
      });
  }, [open]);

  const handleConfirm = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount."); return; }
    if (!methodId) { toast.error("Select a payment method."); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc("record_patient_deposit", {
      p_patient_id: patient.id,
      p_hospital_id: hospitalId,
      p_amount: amt,
      p_payment_method_id: methodId,
      p_received_by: user!.id,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Аванс принят.");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Принять аванс</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Сумма</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Способ оплаты</Label>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                {methods.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.name_en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "..." : "Принять аванс"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({
  open, patient, hospitalId, hospitalizationId, invoiceId, onClose, onConfirmed,
}: {
  open: boolean; patient: any; hospitalId: string;
  hospitalizationId: string; invoiceId: string;
  onClose: () => void; onConfirmed: () => void;
}) {
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);

  const { data: hosp } = useQuery({
    queryKey: ["invoice-hosp", hospitalizationId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("hospitalization_number, admitted_at, discharged_at")
        .eq("id", hospitalizationId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: invoice } = useQuery({
    queryKey: ["invoice-header", invoiceId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_number, created_at")
        .eq("id", invoiceId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["invoice-items", invoiceId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, amount, visit_services(created_at, services(name))")
        .eq("invoice_id", invoiceId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: balance } = useQuery({
    queryKey: ["invoice-balance", invoiceId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_invoice_balance", {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      return (data as any[])[0];
    },
  });

  const totalAmount = Number(balance?.total_amount || 0);

  const groupedItems = useMemo(() => {
    const map = new Map<string, { name: string; dates: string[]; totalCost: number }>();
    for (const it of items as any[]) {
      const name = it.visit_services?.services?.name ?? "—";
      const dateStr = it.visit_services?.created_at
        ? format(new Date(it.visit_services.created_at), "dd.MM.yyyy")
        : "—";
      const existing = map.get(name);
      if (existing) {
        existing.dates.push(dateStr);
        existing.totalCost += Number(it.amount);
      } else {
        map.set(name, { name, dates: [dateStr], totalCost: Number(it.amount) });
      }
    }
    return Array.from(map.values());
  }, [items]);

  const handleConfirm = async () => {
    setConfirming(true);
    const { error } = await supabase.rpc("confirm_hospitalization_invoice", {
      p_invoice_id: invoiceId,
      p_confirmed_by: user!.id,
    });
    setConfirming(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Счёт подтверждён и заблокирован.");
    onConfirmed();
  };


  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;
    const rowsHtml = groupedItems.map((g, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${g.name}</td>
        <td>${g.dates.join("; ")}</td>
        <td>${g.dates.length}</td>
        <td>${g.totalCost.toFixed(2)}</td>
      </tr>
    `).join("");
    const admittedStr = hosp?.admitted_at ? format(new Date(hosp.admitted_at), "dd.MM.yyyy") : "—";
    const dischargedStr = hosp?.discharged_at ? format(new Date(hosp.discharged_at), "dd.MM.yyyy") : "—";
    const invoicedDateStr = format(new Date(), "dd.MM.yyyy");
    printWindow.document.write(`
      <html>
        <head>
          <title>Счет-фактура</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; font-size: 13px; color: #111; }
            h1 { text-align: center; font-size: 18px; letter-spacing: 1px; margin-bottom: 24px; }
            h2 { text-align: center; font-size: 14px; margin: 24px 0 12px; }
            .info-box { display: flex; border: 1px solid #333; margin-bottom: 8px; }
            .info-box > div { flex: 1; padding: 12px 16px; }
            .info-box > div:first-child { border-right: 1px solid #333; }
            .info-box p { margin: 2px 0; }
            table { width: 100%; border-collapse: collapse; }
            table.items th, table.items td { border: 1px solid #333; padding: 6px 10px; text-align: left; }
            table.items th:nth-child(1), table.items td:nth-child(1) { width: 30px; }
            table.items th:nth-child(4), table.items td:nth-child(4),
            table.items th:nth-child(5), table.items td:nth-child(5) { text-align: right; }
            .totals-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            .totals-table td { border: 1px solid #333; padding: 8px 10px; }
            .totals-table td:first-child { font-weight: bold; width: 60%; }
            .footer { margin-top: 32px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>INVOICE:</h1>
          <div class="info-box">
            <div>
              <p><strong>Patient name:</strong> ${patient.last_name} ${patient.first_name}</p>
              <p><strong>Patient DOB:</strong> ${patient.date_of_birth ?? "—"}</p>
              <p><strong>Patient #:</strong> ${patient.patient_number ?? "—"}</p>
            </div>
            <div>
              <p><strong>Hospitalization #:</strong> ${hosp?.hospitalization_number ?? "—"}</p>
              <p><strong>Invoice #:</strong> ${invoice?.invoice_number ?? "—"}</p>
              <p><strong>Hospitalization date:</strong> ${admittedStr}</p>
              <p><strong>Discharge date:</strong> ${dischargedStr}</p>
            </div>
          </div>
          <h2>SERVICES RENDERED:</h2>
          <table class="items">
            <thead>
              <tr><th>#</th><th>SERVICE NAME</th><th>SERVICE DATE</th><th>UNITS</th><th>COST</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <table class="totals-table">
            <tr><td>Total</td><td>${totalAmount.toFixed(2)}</td></tr>
          </table>

          <div class="footer">
            <strong>Invoiced Date:</strong>
            <span>${invoicedDateStr}</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 p-6 pb-0">
          <DialogTitle>Счет-фактура</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 min-h-0 px-6">
          <div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p><span className="text-muted-foreground">Пациент:</span> {patient.last_name} {patient.first_name}</p>
                <p><span className="text-muted-foreground">ДР:</span> {patient.date_of_birth}</p>
                <p><span className="text-muted-foreground">П#:</span> {patient.patient_number}</p>
              </div>
              <div className="space-y-1">
                <p><span className="text-muted-foreground">Госпитализация №:</span> {hosp?.hospitalization_number}</p>
                <p><span className="text-muted-foreground">Счёт №:</span> {invoice?.invoice_number}</p>
                <p><span className="text-muted-foreground">Дата госпитализации:</span> {hosp?.admitted_at ? format(new Date(hosp.admitted_at), "dd.MM.yyyy") : "—"}</p>
                <p><span className="text-muted-foreground">Дата выписки:</span> {hosp?.discharged_at ? format(new Date(hosp.discharged_at), "dd.MM.yyyy") : "—"}</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Услуга</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedItems.map((g, idx) => (
                  <TableRow key={g.name}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{g.name}</TableCell>
                    <TableCell>{g.dates.join("; ")}</TableCell>
                    <TableCell>{g.dates.length}</TableCell>
                    <TableCell className="text-right">{g.totalCost.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="space-y-1 text-sm border-t pt-3">
              <div className="flex justify-between text-base">
                <span className="font-semibold">Итого</span>
                <span className="font-semibold">{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 p-6 pt-3">
          <Button variant="outline" onClick={handlePrint}>Печать</Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? "..." : "Подтвердить"}
          </Button>
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
