import { useMemo } from "react";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LabResultsButton } from "@/components/lab/LabResultsButton";

interface Props {
  mainServices: any[];
  childServices: any[];
  pendingOrders: any[];
  physicianNameMap: Record<string, string>;
}

export default function AssignmentsSection({
  mainServices, childServices, pendingOrders, physicianNameMap,
}: Props) {
  const groups = useMemo(() => {
    const out: Record<string, any[]> = { laboratory: [], consultation: [], other: [] };
    const physicianOrders = [...childServices, ...pendingOrders];
    for (const vs of physicianOrders) {
      const code = vs.services?.service_types?.code;
      if (code === "laboratory") out.laboratory.push(vs);
      else if (code === "consultation") out.consultation.push(vs);
      else out.other.push(vs);
    }
    return out;
  }, [childServices, pendingOrders]);

  const renderTable = (list: any[], groupKey?: string) => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Услуга</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Врач</TableHead>
            <TableHead>Время</TableHead>
            <TableHead>Завершено</TableHead>
            {groupKey === "laboratory" && <TableHead>Действия</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((vs) => (
            <TableRow key={vs.id}>
              <TableCell className="font-medium">{vs.services?.name}</TableCell>
              <TableCell>
                <span className="text-xs rounded border px-2 py-0.5 bg-muted">
                  {vs.service_statuses?.name_ru}
                </span>
              </TableCell>
              <TableCell className="text-sm">
                {vs.assigned_physician_id
                  ? physicianNameMap[vs.assigned_physician_id] ?? "—"
                  : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {vs.scheduled_at
                  ? format(new Date(vs.scheduled_at), "dd.MM HH:mm")
                  : vs.queue_number
                  ? `#${vs.queue_number}`
                  : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {vs.completed_at
                  ? format(new Date(vs.completed_at), "dd.MM.yyyy HH:mm")
                  : "—"}
              </TableCell>
              {groupKey === "laboratory" && (
                <TableCell>
                  {vs.service_statuses?.code === "completed" && (
                    <LabResultsButton
                      visitServiceId={vs.id}
                      variant="indicator"
                    />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderGroup = (key: string, name: string, list: any[]) => {
    if (list.length === 0) return null;
    return (
      <div key={key} className="space-y-2">
        <h3 className="font-heading text-base font-semibold">{name}</h3>
        {renderTable(list, key)}
      </div>
    );
  };

  return (
    <div className="document-section-page space-y-6">
      {mainServices.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-heading text-lg font-semibold border-b pb-2">Назначения</h2>
          {renderTable(mainServices)}
        </div>
      )}
      {renderGroup("laboratory", "Лаборатория", groups.laboratory)}
      {renderGroup("consultation", "Консультации", groups.consultation)}
      {renderGroup("other", "Услуги", groups.other)}

      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Медикаменты — доступно в Фазе 6
      </div>
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Уход — доступно в Фазе 9
      </div>
    </div>
  );
}
