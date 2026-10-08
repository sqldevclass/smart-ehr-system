import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  usePreviousHospitalizations,
  type HospitalizationStay,
} from "@/hooks/usePreviousHospitalizations";
import { cn } from "@/lib/utils";

interface Props {
  patientId: string;
  hospitalId: string;
  /** Left out of the list. Omit it to list every stay, including the current one. */
  currentHospitalizationId?: string;
  /** Renders one stay's data. Mounted only while that stay is expanded. */
  renderStay: (hospitalizationId: string) => ReactNode;
  label?: string;
  /** false: no "show history" toggle, the list is always visible. */
  collapsible?: boolean;
  /** Small extra on each stay's row, e.g. a total. Rendered next to the department. */
  renderStaySummary?: (hospitalizationId: string) => ReactNode;
}

const formatStayRange = (stay: HospitalizationStay) =>
  `${format(new Date(stay.admitted_at), "dd.MM.yyyy")} — ${
    stay.discharged_at ? format(new Date(stay.discharged_at), "dd.MM.yyyy") : "по настоящее время"
  }`;

/**
 * List of the patient's hospitalizations. By default it sits behind a
 * "show history" toggle that starts closed; nothing is fetched until the user
 * opens it, and a stay's data is only rendered (and fetched) while that stay is
 * expanded.
 */
export default function PreviousHospitalizations({
  patientId,
  hospitalId,
  currentHospitalizationId,
  renderStay,
  label = "История госпитализаций",
  collapsible = true,
  renderStaySummary,
}: Props) {
  const [toggledOpen, setToggledOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const open = !collapsible || toggledOpen;
  const { data: stays = [], isLoading, error } = usePreviousHospitalizations({
    patientId,
    hospitalId,
    currentHospitalizationId,
    enabled: open,
  });

  return (
    <div className="pt-1">
      {collapsible && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setToggledOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          {open ? "Скрыть историю" : label}
        </button>
      )}

      {open && (
        <div className={cn("space-y-2", collapsible && "mt-3")}>
          {isLoading && <p className="text-sm text-muted-foreground pl-2">Загрузка...</p>}
          {error && (
            <p className="text-sm text-destructive pl-2">Не удалось загрузить историю госпитализаций</p>
          )}
          {!isLoading && !error && stays.length === 0 && (
            <p className="text-sm text-muted-foreground pl-2">
              {currentHospitalizationId ? "Предыдущих госпитализаций нет" : "Госпитализаций нет"}
            </p>
          )}
          {stays.map((stay) => {
            const isExpanded = expandedId === stay.id;
            return (
              <div key={stay.id} className="border rounded-md bg-muted/20">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : stay.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors rounded-md"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <span className="font-medium">{formatStayRange(stay)}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
                    {renderStaySummary?.(stay.id)}
                    {stay.departments?.name && <span className="truncate">{stay.departments.name}</span>}
                  </span>
                </button>
                {isExpanded && <div className="px-3 pb-3">{renderStay(stay.id)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
