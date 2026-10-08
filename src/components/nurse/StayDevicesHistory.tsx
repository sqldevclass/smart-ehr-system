import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useStayRows } from "@/hooks/useStayRows";
import { DEVICE_FORMS } from "@/lib/deviceForms";
import { groupDeviceRecords } from "@/lib/groupDeviceRecords";
import { cn } from "@/lib/utils";

/** Most monitoring records a past stay loads for its devices. */
export const STAY_DEVICE_RECORDS_LIMIT = 500;

interface DeviceRecord {
  id: string;
  form_type: string;
  device_label: string | null;
  inserted_at: string;
  removed_at: string | null;
  criticality_flag: boolean;
  notes: string | null;
  recorded_at: string;
  profiles?: { full_name?: string | null } | null;
}

const formatDay = (day: string) => format(parseISO(day), "dd.MM.yyyy");

/**
 * The devices a hospitalization had, one line each: kind, insertion and removal
 * dates, number of checks and whether any was critical. Open a device to see its
 * individual checks. Read-only.
 */
export default function StayDevicesHistory({ hospitalizationId }: { hospitalizationId: string }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const { data: records = [], isLoading, error } = useStayRows<DeviceRecord>({
    table: "nurse_device_monitoring_records",
    select:
      "id, form_type, device_label, inserted_at, removed_at, criticality_flag, notes, recorded_at, profiles!recorded_by(full_name)",
    hospitalizationId,
    orderBy: "recorded_at",
    limit: STAY_DEVICE_RECORDS_LIMIT,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Загрузка...</p>;
  if (error) return <p className="text-xs text-destructive">Не удалось загрузить устройства</p>;

  return (
    <div className="space-y-2">
      {groupDeviceRecords(records).map((device) => {
        const isExpanded = expandedKey === device.key;
        const removedAt = device.entries[0].removed_at; // the newest record decides, as on the live card
        const criticalCount = device.entries.filter((entry) => entry.criticality_flag).length;
        const title = DEVICE_FORMS[device.form_type]?.label ?? device.form_type;
        return (
          <div key={device.key} className="border rounded-md bg-background">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setExpandedKey(isExpanded ? null : device.key)}
              className="w-full space-y-0.5 rounded-md px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <ChevronRight
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
                  />
                  <span>
                    {title}
                    {device.device_label ? ` · ${device.device_label}` : ""}
                  </span>
                </span>
                {criticalCount > 0 && (
                  <span className="shrink-0 rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                    Критично: {criticalCount}
                  </span>
                )}
              </div>
              <p className="pl-6 text-xs text-muted-foreground">
                Установлено {formatDay(device.inserted_at)}
                {removedAt ? ` · Удалено ${formatDay(removedAt)}` : ""} · Проверок: {device.entries.length}
              </p>
            </button>
            {isExpanded && (
              <ul className="space-y-1.5 border-t px-3 py-2">
                {device.entries.map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                      <span>{format(new Date(entry.recorded_at), "dd.MM.yyyy HH:mm")}</span>
                      {entry.profiles?.full_name && <span>· {entry.profiles.full_name}</span>}
                      {entry.criticality_flag && <span className="font-medium text-red-700">· критично</span>}
                    </div>
                    {entry.notes && <div>{entry.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
