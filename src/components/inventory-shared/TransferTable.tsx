import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { TransferStatusBadge } from "./transferStatus";
import type { useTransferActions } from "./useTransferActions";

interface Props {
  rows: any[];
  currentWarehouseId?: string;
  actions: Pick<ReturnType<typeof useTransferActions>, "openAction" | "openDetails">;
  compact?: boolean;
}

export function TransferTable({ rows, currentWarehouseId, actions, compact = false }: Props) {
  const cell = compact ? "p-2" : "p-3";
  return <div className="border rounded-lg overflow-x-auto bg-card">
    <table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left">
      {["Дата", "Откуда", "Куда", "Статус", "Позиции", "Отправил", "Принял", "Действия"].map((label) => <th key={label} className={cell}>{label}</th>)}
    </tr></thead><tbody>{rows.map((transfer) => <tr key={transfer.id} className="border-t">
      <td className={`${cell} whitespace-nowrap`}>{transfer.sent_at ? format(new Date(transfer.sent_at), "dd.MM.yyyy HH:mm") : "—"}</td>
      <td className={cell}>{transfer.from_warehouse?.name || "—"}</td><td className={cell}>{transfer.to_warehouse?.name || "—"}</td>
      <td className={cell}><TransferStatusBadge status={transfer.status} />{transfer.reject_reason && <p className="mt-1 text-muted-foreground">{transfer.reject_reason}</p>}{transfer.rejected_at && <p className="text-muted-foreground">{format(new Date(transfer.rejected_at), "dd.MM.yyyy HH:mm")}</p>}</td>
      <td className={cell}><Button variant="link" onClick={() => actions.openDetails(transfer)}>Позиции ({transfer.transfer_record_items?.length ?? 0})</Button></td>
      <td className={cell}>{transfer.sent_by_profile?.full_name || "—"}</td><td className={cell}>{transfer.accepted_by_profile?.full_name || "—"}</td>
      <td className={cell}><div className="flex gap-2">{transfer.status === "pending_acceptance" && <>
        {transfer.to_warehouse_id === currentWarehouseId && <><Button size="sm" onClick={() => actions.openAction("accept", transfer)}>Принять</Button><Button size="sm" variant="outline" onClick={() => actions.openAction("reject", transfer)}>Отклонить</Button></>}
        {transfer.from_warehouse_id === currentWarehouseId && <Button size="sm" variant="outline" onClick={() => actions.openAction("cancel", transfer)}>Отменить</Button>}
      </>}{transfer.status === "rejected" && <>
        {transfer.from_warehouse_id === currentWarehouseId && <Button size="sm" variant="outline" onClick={() => actions.openAction("return", transfer)}>Принять возврат</Button>}
        {transfer.to_warehouse_id === currentWarehouseId && <span className="text-muted-foreground">Ожидает подтверждения возврата</span>}
      </>}</div></td>
    </tr>)}{rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Нет перемещений</td></tr>}</tbody></table>
  </div>;
}