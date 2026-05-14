import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const flagDisplay = (flag: string | null) => {
  switch (flag) {
    case "high": return <span className="text-destructive">↑</span>;
    case "low": return <span className="text-destructive">↓</span>;
    case "critical_high": return <span className="font-bold text-destructive">↑↑</span>;
    case "critical_low": return <span className="font-bold text-destructive">↓↓</span>;
    case "normal": return <span className="text-muted-foreground">–</span>;
    default: return <span className="text-muted-foreground">–</span>;
  }
};

export function LabResultsButton({
  visitServiceId,
  variant = "button",
  label = "View Results",
}: {
  visitServiceId: string;
  variant?: "button" | "indicator";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const { data: sample } = useQuery({
    queryKey: ["lab-sample-by-vs", visitServiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lab_samples")
        .select("id, barcode, status, completed_at")
        .eq("visit_service_id", visitServiceId)
        .order("drawn_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!visitServiceId,
  });

  const { data: results = [] } = useQuery({
    queryKey: ["lab-results-view", sample?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lab_results")
        .select("*, lab_parameter_templates(name, sort_order)")
        .eq("lab_sample_id", sample!.id);
      const sorted = (data || []).slice().sort((a: any, b: any) =>
        (a.lab_parameter_templates?.sort_order ?? 0) - (b.lab_parameter_templates?.sort_order ?? 0));
      return sorted;
    },
    enabled: !!sample?.id && open,
  });

  if (!sample) return null;

  return (
    <>
      {variant === "indicator" ? (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 hover:bg-blue-200",
            "dark:bg-blue-900/40 dark:text-blue-200",
          )}
        >
          <FlaskConical className="h-3 w-3" /> Lab Results
        </button>
      ) : (
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
          <FlaskConical className="h-3.5 w-3.5" /> {label}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Lab Results — {sample.barcode}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parameter</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Flag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.lab_parameter_templates?.name || r.parameter_name}
                      </TableCell>
                      <TableCell className="font-mono">{r.value ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.unit || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.ref_min != null || r.ref_max != null
                          ? `${r.ref_min ?? "—"} – ${r.ref_max ?? "—"}`
                          : "—"}
                      </TableCell>
                      <TableCell>{flagDisplay(r.flag)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
