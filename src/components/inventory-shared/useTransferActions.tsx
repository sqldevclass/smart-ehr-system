import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TransferStatusBadge } from "./transferStatus";

type ActionKind = "accept" | "reject" | "cancel" | "return";
const titles: Record<ActionKind, string> = {
  accept: "Принять перемещение?", reject: "Отклонить перемещение?",
  cancel: "Отменить перемещение?", return: "Принять возврат?",
};
const messages: Record<ActionKind, string> = {
  accept: "Перемещение принято", cancel: "Перемещение отменено",
  reject: "Перемещение отклонено, ожидает возврата", return: "Возврат принят, остаток восстановлен",
};

export function useTransferActions(refresh: (ids: string[]) => void) {
  const qc = useQueryClient();
  const [details, setDetails] = useState<any>(null);
  const [action, setAction] = useState<{ kind: ActionKind; transfer: any } | null>(null);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("Выберите перемещение");
      if (action.kind === "reject" && !reason.trim()) throw new Error("Укажите причину отклонения");
      const args = { p_transfer_record_id: action.transfer.id };
      const { error } = action.kind === "reject"
        ? await supabase.rpc("reject_transfer", { ...args, p_reason: reason.trim() })
        : action.kind === "cancel" ? await supabase.rpc("cancel_transfer", args)
        : action.kind === "return" ? await supabase.rpc("accept_return", args)
        : await supabase.rpc("accept_transfer", args);
      if (error) throw error;
      return action;
    },
    onSuccess: (completed) => {
      toast.success(messages[completed.kind]);
      refresh([completed.transfer.from_warehouse_id, completed.transfer.to_warehouse_id]);
      for (const key of ["nurse-stock-orders", "stock-orders", "stock-orders-pending-count"]) qc.invalidateQueries({ queryKey: [key] });
      setAction(null); setReason("");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const openAction = (kind: ActionKind, transfer: any) => { setReason(""); setAction({ kind, transfer }); };
  const dialogs = <>
    <Dialog open={!!details} onOpenChange={(value) => { if (!value) setDetails(null); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>Позиции перемещения</DialogTitle></DialogHeader>
        {details && <><TransferStatusBadge status={details.status} />{details.notes && <p>{details.notes}</p>}<table className="w-full text-sm"><thead><tr>{["Наименование", "Серия", "Годен до", "Количество"].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{details.transfer_record_items?.map((item: any) => <tr key={item.id} className="border-t"><td className="p-2">{item.drug_formulary?.trade_name || item.products?.name || "—"}</td><td className="p-2">{item.inventory_batches?.series_number || "—"}</td><td className="p-2">{item.inventory_batches?.expiry_date || "—"}</td><td className="p-2">{item.quantity_units}</td></tr>)}</tbody></table></>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!action} onOpenChange={(value) => { if (!value && !mutation.isPending) { setAction(null); setReason(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>{action ? titles[action.kind] : ""}</DialogTitle></DialogHeader>
        {action?.kind === "reject" && <div className="space-y-2"><Label htmlFor="transfer-reject-reason">Причина отклонения *</Label><Textarea id="transfer-reject-reason" required value={reason} onChange={(event) => setReason(event.target.value)} /></div>}
        <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setAction(null)}>Назад</Button><Button disabled={mutation.isPending || (action?.kind === "reject" && !reason.trim())} onClick={() => mutation.mutate()}>Подтвердить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
  return { openAction, openDetails: (transfer: any) => setDetails(transfer), dialogs };
}