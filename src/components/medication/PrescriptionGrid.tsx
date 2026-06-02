import { useState } from "react";
import { format } from "date-fns";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  prescriptions: any[];
  slots: any[];
  viewerRole: "physician" | "nurse";
  isReadOnly: boolean;
  onExtend: (prescriptionId: string, date: Date) => void;
  onCancelDay: (prescriptionId: string, date: Date) => void;
  onOverrideSlot: (slotId: string, scheduledAt: string, dose: string) => void;
  onAdministerSlot: (slotId: string, doseGiven: string, notes: string) => void;
  onSkipSlot: (slotId: string) => void;
}

const ROUTES: Record<string, string> = {
  per_os: "Перорально",
  iv_bolus: "В/в болюсно",
  iv_drip: "В/в капельно",
  im: "В/м",
  sc: "Подкожно",
  nasal: "Назально",
  rectal: "Ректально",
  nasogastric: "Назогастрально",
  sublingual: "Подъязык",
  ear: "В ухо",
  eye: "В глаз",
  vaginal: "Вагинально",
  epidural: "Эпидурально",
  transdermal: "Трансдермально",
  intrathecal: "Интратекально",
  intraosseous: "Внутрикостно",
  endotracheal: "Эндотрахеально",
  other: "Другое",
};

export default function PrescriptionGrid({
  prescriptions,
  slots,
  viewerRole,
  isReadOnly,
  onExtend,
  onCancelDay,
  onOverrideSlot,
  onAdministerSlot,
  onSkipSlot,
}: Props) {
  const [overrideSlot, setOverrideSlot] = useState<{
    slotId: string;
    scheduledAt: string;
    dose: string;
  } | null>(null);
  const [adminSlot, setAdminSlot] = useState<{
    slotId: string;
    doseGiven: string;
    notes: string;
  } | null>(null);

  const getSlotsForDate = (prescriptionId: string, date: Date) =>
    slots
      .filter(
        (s: any) =>
          s.prescription_id === prescriptionId &&
          new Date(s.scheduled_at).toDateString() === date.toDateString(),
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );

  const isPast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const allDateColumns = (() => {
    const set = new Set<string>();
    prescriptions.forEach((p: any) => {
      const start = new Date(p.prescribed_at);
      const days = p.duration_days ?? 1;
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        d.setHours(0, 0, 0, 0);
        set.add(d.toISOString());
      }
    });
    return Array.from(set)
      .map((s) => new Date(s))
      .sort((a, b) => a.getTime() - b.getTime());
  })();

  if (prescriptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Нет активных назначений</p>
    );
  }

  return (
    <>
      <div className="w-full overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="border p-1.5 text-left bg-white sticky left-0 z-20 w-6">#</th>
                <th className="border p-1.5 text-left bg-white sticky left-6 z-20 min-w-48">НАЗНАЧЕНИЕ</th>
                <th className="border p-1.5 text-left bg-white sticky left-[222px] z-20 w-16">Врач</th>
                {allDateColumns.map((date, i) => {
                  const isToday =
                    date.toDateString() === new Date().toDateString();
                  return (
                    <th
                      key={i}
                      className={cn(
                        "border p-1.5 text-center min-w-24 font-medium",
                        isToday ? "bg-blue-50 text-blue-700" : "text-muted-foreground",
                      )}
                    >
                      {format(date, "dd.MM")}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((p: any, pIdx: number) => {
                const pStart = new Date(p.prescribed_at);
                pStart.setHours(0, 0, 0, 0);
                const pEnd = new Date(pStart);
                pEnd.setDate(pEnd.getDate() + (p.duration_days ?? 1) - 1);
                return (
                  <tr key={p.id} className="align-top">
                    <td className="border p-1.5 text-center bg-white sticky left-0 z-10 font-medium">
                      {pIdx + 1}
                    </td>
                    <td className="border p-1.5 bg-white sticky left-6 z-10">
                      <div className="font-medium">
                        {p.drug_formulary?.trade_name}{" "}
                        <span className="font-normal">
                          {p.dose}{p.dose_unit}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {ROUTES[p.route] ?? p.route}
                        {p.schedule_times?.length > 0 &&
                          ` · ${p.schedule_times.join(", ")}`}
                      </div>
                      {p.prescription_type === "prn" && (
                        <span className="inline-block mt-0.5 px-1 rounded bg-purple-100 text-purple-700">
                          PRN
                        </span>
                      )}
                      {p.prn_condition && (
                        <div className="text-purple-700 mt-0.5">
                          При: {p.prn_condition}
                        </div>
                      )}
                    </td>
                    <td className="border p-1.5 bg-white sticky left-[222px] z-10 text-muted-foreground">
                      {p.profiles?.full_name
                        ?.split(" ")
                        .map((w: string) => w[0])
                        .join("") ?? "—"}
                    </td>
                    {allDateColumns.map((date, di) => {
                      const dayKey = new Date(date);
                      dayKey.setHours(0, 0, 0, 0);
                      const inRange = dayKey >= pStart && dayKey <= pEnd;
                      const daySlots = getSlotsForDate(p.id, date);
                      const isToday =
                        date.toDateString() === new Date().toDateString();

                      if (!inRange) {
                        return (
                          <td
                            key={di}
                            className="border p-1.5 bg-gray-50 min-w-24 align-top"
                          >
                            {viewerRole === "physician" &&
                              !isReadOnly &&
                              !isPast(date) && (
                                <button
                                  title="Продлить до этой даты"
                                  onClick={() => onExtend(p.id, date)}
                                  className="text-xs text-primary hover:underline opacity-60 hover:opacity-100"
                                >
                                  +1д
                                </button>
                              )}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={di}
                          className={cn(
                            "border p-1.5 min-w-24 align-top",
                            isToday ? "bg-blue-50/50" : "",
                          )}
                        >
                          {viewerRole === "physician" && !isReadOnly && (
                            <div className="flex items-center gap-1 mb-1">
                              <button
                                title="Изменить"
                                className="p-0.5 rounded hover:bg-muted"
                                onClick={() => {
                                  const firstSlot = daySlots[0];
                                  if (firstSlot) {
                                    setOverrideSlot({
                                      slotId: firstSlot.id,
                                      scheduledAt: format(
                                        new Date(firstSlot.scheduled_at),
                                        "HH:mm",
                                      ),
                                      dose:
                                        firstSlot.override_dose ??
                                        `${p.dose}${p.dose_unit ?? ""}`,
                                    });
                                  }
                                }}
                              >
                                <Pencil size={11} className="text-blue-600" />
                              </button>
                              <button
                                title="Отменить день"
                                className="p-0.5 rounded hover:bg-muted"
                                onClick={() => onCancelDay(p.id, date)}
                              >
                                <X size={11} className="text-red-500" />
                              </button>
                              {!isPast(date) && daySlots.length === 0 && (
                                <button
                                  title="Продлить до этой даты"
                                  onClick={() => onExtend(p.id, date)}
                                  className="text-xs text-primary hover:underline"
                                >
                                  +1д
                                </button>
                              )}
                            </div>
                          )}
                          {daySlots.map((slot: any) => (
                            <div key={slot.id} className="mb-1">
                              {slot.status === "done" ? (
                                <div className="text-green-700">
                                  ✅{" "}
                                  {format(
                                    new Date(slot.administered_at),
                                    "HH:mm",
                                  )}{" "}
                                  {slot.dose_given}
                                </div>
                              ) : slot.status === "skipped" ? (
                                <div className="text-gray-400 line-through">
                                  {format(new Date(slot.scheduled_at), "HH:mm")}
                                </div>
                              ) : (
                                <div>
                                  <div className="text-orange-600 font-medium">
                                    {format(
                                      new Date(slot.scheduled_at),
                                      "HH:mm",
                                    )}
                                    {slot.override_dose && (
                                      <span className="ml-1 text-blue-600">
                                        {slot.override_dose}
                                      </span>
                                    )}
                                  </div>
                                  {viewerRole === "nurse" && !isReadOnly && (
                                    <div className="flex gap-1 mt-0.5">
                                      <button
                                        className="text-primary underline text-xs"
                                        onClick={() =>
                                          setAdminSlot({
                                            slotId: slot.id,
                                            doseGiven:
                                              slot.override_dose ??
                                              `${p.dose}${p.dose_unit ?? ""}`,
                                            notes: "",
                                          })
                                        }
                                      >
                                        Выполнить
                                      </button>
                                      <button
                                        className="text-gray-500 underline text-xs"
                                        onClick={() => onSkipSlot(slot.id)}
                                      >
                                        Пропустить
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {overrideSlot && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 space-y-3 w-72 shadow-xl">
            <h4 className="font-medium text-sm">Изменить назначение</h4>
            <div>
              <Label className="text-xs">Время</Label>
              <Input
                type="time"
                value={overrideSlot.scheduledAt}
                onChange={(e) =>
                  setOverrideSlot((prev) =>
                    prev ? { ...prev, scheduledAt: e.target.value } : null,
                  )
                }
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Доза</Label>
              <Input
                value={overrideSlot.dose}
                onChange={(e) =>
                  setOverrideSlot((prev) =>
                    prev ? { ...prev, dose: e.target.value } : null,
                  )
                }
                className="h-8 text-sm mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!overrideSlot) return;
                  const today = new Date();
                  const [hh, mm] = overrideSlot.scheduledAt.split(":");
                  today.setHours(parseInt(hh), parseInt(mm), 0, 0);
                  onOverrideSlot(
                    overrideSlot.slotId,
                    today.toISOString(),
                    overrideSlot.dose,
                  );
                  setOverrideSlot(null);
                }}
              >
                Сохранить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOverrideSlot(null)}
              >
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {adminSlot && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 space-y-3 w-72 shadow-xl">
            <h4 className="font-medium text-sm">Выполнить назначение</h4>
            <div>
              <Label className="text-xs">Доза введена</Label>
              <Input
                value={adminSlot.doseGiven}
                onChange={(e) =>
                  setAdminSlot((prev) =>
                    prev ? { ...prev, doseGiven: e.target.value } : null,
                  )
                }
                className="h-8 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Примечание</Label>
              <Input
                value={adminSlot.notes}
                onChange={(e) =>
                  setAdminSlot((prev) =>
                    prev ? { ...prev, notes: e.target.value } : null,
                  )
                }
                className="h-8 text-sm mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!adminSlot) return;
                  onAdministerSlot(
                    adminSlot.slotId,
                    adminSlot.doseGiven,
                    adminSlot.notes,
                  );
                  setAdminSlot(null);
                }}
              >
                Сохранить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAdminSlot(null)}
              >
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
