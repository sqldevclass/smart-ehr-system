import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDiscounts } from "@/hooks/useDiscounts";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  created_at: string;
  hospitalization_id: string;
  hospitalizations: {
    hospitalization_number: string;
    patients: { first_name: string; last_name: string; patient_number: string } | null;
  } | null;
}

interface InvoiceItem {
  id: string;
  amount: number;
  original_amount: number | null;
  discount_id: string | null;
  discount_percent: number | null;
  discounts: { name: string } | null;
  visit_services: { created_at: string; services: { name: string } | null } | null;
}

const money = (value: number) => value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const patientName = (invoice: InvoiceRow) => [invoice.hospitalizations?.patients?.last_name, invoice.hospitalizations?.patients?.first_name].filter(Boolean).join(" ") || "—";

export default function InvoiceDiscountPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [discountId, setDiscountId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: discounts = [], error: discountError } = useDiscounts();
  const activeDiscounts = discounts.filter((discount) => discount.is_active);
  const selectedDiscount = activeDiscounts.find((discount) => discount.id === discountId);

  const { data: invoices = [], isLoading: invoicesLoading, error: invoicesError } = useQuery({
    queryKey: ["finance-discount-invoices", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("invoices")
        .select("id, invoice_number, created_at, hospitalization_id, hospitalizations(hospitalization_number, patients(first_name, last_name, patient_number))")
        .eq("hospital_id", user.hospitalId).eq("status", "active").not("hospitalization_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceRow[];
    },
  });

  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);
  const { data: items = [], isLoading: itemsLoading, error: itemsError } = useQuery({
    queryKey: ["finance-discount-items", user?.hospitalId, invoiceId],
    enabled: !!user && !!selectedInvoice,
    queryFn: async () => {
      if (!invoiceId) return [];
      const { data, error } = await supabase.from("invoice_items")
        .select("id, amount, original_amount, discount_id, discount_percent, discounts(name), visit_services(created_at, services(name))")
        .eq("invoice_id", invoiceId);
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceItem[];
    },
  });

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return invoices.filter((invoice) => [patientName(invoice), invoice.hospitalizations?.patients?.patient_number,
      invoice.invoice_number, invoice.hospitalizations?.hospitalization_number]
      .some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [invoices, search]);

  const invalidate = (id: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["finance-discount-items", user?.hospitalId, id] }),
    queryClient.invalidateQueries({ queryKey: ["finance-discount-invoices", user?.hospitalId] }),
  ]);

  const changeDiscount = useMutation({
    mutationFn: async ({ remove, itemId }: { remove: boolean; itemId?: string }) => {
      if (!invoiceId || !selectedInvoice) throw new Error("Select an active invoice.");
      if (!remove && !selectedDiscount) throw new Error("Select a discount.");
      const args = { p_invoice_id: invoiceId, ...(itemId ? { p_invoice_item_id: itemId } : {}) };
      const { data, error } = remove
        ? await supabase.rpc("remove_invoice_discount", args)
        : await supabase.rpc("apply_invoice_discount", { ...args, p_discount_id: discountId });
      if (error) throw error;
      return { id: invoiceId, count: Number(data), remove };
    },
    onSuccess: ({ id, count, remove }) => {
      toast.success(remove ? `Discount removed from ${count} items` : `Discount applied to ${count} items`);
      return invalidate(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!user || !invoiceId || !selectedInvoice || items.length === 0) throw new Error("Select an invoice with items.");
      const { error } = await supabase.rpc("confirm_hospitalization_invoice", { p_invoice_id: invoiceId, p_confirmed_by: user.id });
      if (error) throw error;
      return invoiceId;
    },
    onSuccess: (id) => {
      toast.success("Invoice created and locked.");
      setInvoiceId(null);
      setDiscountId("");
      setConfirmOpen(false);
      return invalidate(id);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = changeDiscount.isPending || confirm.isPending;
  const original = items.reduce((sum, item) => sum + Number(item.original_amount ?? item.amount), 0);
  const payable = items.reduce((sum, item) => sum + Number(item.amount), 0);

  return (
    <section className="space-y-4 border-t pt-6">
      <h2 className="font-heading text-xl font-semibold text-foreground">Apply discount to an invoice</h2>
      <SearchInput placeholder="Search patient, patient ID, hospitalization or invoice" value={search} onChange={(event) => setSearch(event.target.value)} />
      {invoicesError ? <p role="alert" className="text-sm text-destructive">{invoicesError.message}</p> : (
        <div className="max-h-64 overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Patient ID</TableHead><TableHead>Hospitalization #</TableHead><TableHead>Invoice #</TableHead></TableRow></TableHeader>
            <TableBody>
              {invoicesLoading || filteredInvoices.length === 0 ? <TableRow><TableCell colSpan={4} className="text-muted-foreground">
                {invoicesLoading ? "Loading…" : invoices.length === 0 ? "No active hospitalization invoices." : "No matching invoices."}
              </TableCell></TableRow> : filteredInvoices.map((invoice) => <TableRow key={invoice.id} aria-selected={selectedInvoice?.id === invoice.id}
                className={selectedInvoice?.id === invoice.id ? "bg-muted" : ""}>
                <TableCell><Button variant="link" className="h-auto p-0 text-left whitespace-normal" disabled={busy} onClick={() => { setInvoiceId(invoice.id); setDiscountId(""); setConfirmOpen(false); }}>{patientName(invoice)}</Button></TableCell>
                <TableCell>{invoice.hospitalizations?.patients?.patient_number ?? "—"}</TableCell>
                <TableCell>{invoice.hospitalizations?.hospitalization_number ?? "—"}</TableCell><TableCell>{invoice.invoice_number}</TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
      )}
      {!selectedInvoice ? <p className="text-sm text-muted-foreground">No invoice selected.</p> : (
        <div className="space-y-3">
          <h3 className="font-medium text-foreground">{patientName(selectedInvoice)} · Invoice # {selectedInvoice.invoice_number}</h3>
          {discountError && <p role="alert" className="text-sm text-destructive">{discountError.message}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedDiscount?.id ?? ""} onValueChange={setDiscountId} disabled={busy}>
              <SelectTrigger className="w-full sm:w-64" aria-label="Discount"><SelectValue placeholder="Select a discount" /></SelectTrigger>
              <SelectContent>{activeDiscounts.map((discount) => <SelectItem key={discount.id} value={discount.id}>{discount.name} ({Number(discount.percent)}%)</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" disabled={busy || itemsLoading || !!itemsError || !selectedDiscount || items.length === 0} onClick={() => changeDiscount.mutate({ remove: false })}>Apply to entire invoice</Button>
            <Button size="sm" variant="outline" disabled={busy || itemsLoading || !!itemsError || !items.some((item) => item.discount_id)} onClick={() => changeDiscount.mutate({ remove: true })}>Remove all discounts</Button>
          </div>
          {itemsError ? <p role="alert" className="text-sm text-destructive">{itemsError.message}</p> : (
            <>
              <Table>
                <TableHeader><TableRow><TableHead>Service</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Original</TableHead><TableHead>Discount</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {itemsLoading || items.length === 0 ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">{itemsLoading ? "Loading…" : "No invoice items."}</TableCell></TableRow> : items.map((item) => <TableRow key={item.id}>
                    <TableCell>{item.visit_services?.services?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.visit_services?.created_at ? format(new Date(item.visit_services.created_at), "dd.MM.yyyy") : "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(Number(item.original_amount ?? item.amount))}</TableCell>
                    <TableCell>{item.discount_id ? `${item.discounts?.name ?? "—"} (${Number(item.discount_percent)}%)` : "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{money(Number(item.amount))}</TableCell>
                    <TableCell><div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy || !selectedDiscount} onClick={() => changeDiscount.mutate({ remove: false, itemId: item.id })}>Apply</Button>
                      {item.discount_id && <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeDiscount.mutate({ remove: true, itemId: item.id })}>Remove</Button>}
                    </div></TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
              {!itemsLoading && <div className="ml-auto max-w-sm space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between gap-4"><span>Original total</span><span>{money(original)}</span></div>
                <div className="flex justify-between gap-4"><span>Discount total</span><span>{money(original - payable)}</span></div>
                <div className="flex justify-between gap-4 font-semibold"><span>Payable total</span><span>{money(payable)}</span></div>
              </div>}
            </>
          )}
          <div className="flex justify-end"><Button disabled={busy || itemsLoading || !!itemsError || items.length === 0} onClick={() => setConfirmOpen(true)}>Create invoice</Button></div>
        </div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={(value) => { if (!confirm.isPending) setConfirmOpen(value); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Create invoice?</AlertDialogTitle><AlertDialogDescription>This locks the invoice and sends it to the cashier. Continue?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={confirm.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); confirm.mutate(); }}>{confirm.isPending ? "Creating…" : "Create invoice"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}