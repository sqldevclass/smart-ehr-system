import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitService: {
    id: string;
    patient_id: string;
    patients?: { first_name?: string; last_name?: string; patient_number?: string };
    services?: { name?: string };
  } | null;
  barcodePrefix: string;
  sampleStatus: "in_progress" | "drawn";
  onDrawn?: (visitServiceId: string) => void | Promise<void>;
}

export default function DrawSampleDialog({
  open,
  onOpenChange,
  visitService,
  barcodePrefix,
  sampleStatus,
  onDrawn,
}: Props) {
  const { user } = useAuth();
  const [barcode, setBarcode] = useState("");
  const [notes, setNotes] = useState("");
  const [savedBarcode, setSavedBarcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setBarcode("");
      setNotes("");
      setSavedBarcode(null);
      setSaving(false);
    }
  }, [open, visitService?.id]);

  const saveDraw = async () => {
    if (!visitService || !user) return;
    setSaving(true);
    try {
      const finalBarcode = barcode.trim() || `${barcodePrefix}-${Date.now()}`;
      const { error: insertErr } = await supabase.from("lab_samples").insert({
        visit_service_id: visitService.id,
        patient_id: visitService.patient_id,
        hospital_id: user.hospitalId,
        barcode: finalBarcode,
        status: sampleStatus,
        drawn_by: user.id,
        drawn_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });
      if (insertErr) throw insertErr;

      if (onDrawn) await onDrawn(visitService.id);

      toast.success(`Sample drawn. Barcode: ${finalBarcode}`);
      setSavedBarcode(finalBarcode);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const printLabel = () => {
    if (!savedBarcode || !visitService) return;
    const w = window.open("", "_blank", "width=400,height=300");
    if (!w) return;
    const p = visitService.patients;
    const patientName = [p?.last_name, p?.first_name].filter(Boolean).join(" ");
    w.document.write(`
      <html><head><title>Label ${savedBarcode}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px}.bc{font-size:32px;font-weight:bold;letter-spacing:2px;margin:20px 0;border:2px solid #000;padding:10px;font-family:monospace}</style>
      </head><body>
      <h2>${patientName}</h2>
      <p>#${p?.patient_number || ""}</p>
      <p>${visitService.services?.name || ""}</p>
      <div class="bc">${savedBarcode}</div>
      <p>${format(new Date(), "MMM d, yyyy HH:mm")}</p>
      <script>window.print();setTimeout(()=>window.close(),500);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Draw Sample</DialogTitle></DialogHeader>
        {visitService && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>{[visitService.patients?.last_name, visitService.patients?.first_name].filter(Boolean).join(" ")}</p>
              <p>{visitService.services?.name}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Barcode (auto if empty)</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={`${barcodePrefix}-...`} disabled={!!savedBarcode} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!!savedBarcode} />
            </div>
            {savedBarcode && (
              <div className="rounded border bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground">Saved Barcode</p>
                <p className="font-mono text-lg font-bold">{savedBarcode}</p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {savedBarcode ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={printLabel}>Print Label</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={saveDraw} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
