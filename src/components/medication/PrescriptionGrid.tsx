import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const FOOD_RULES: Record<string, string> = {
  any: "Когда угодно",
  before_meal: "Перед едой",
  during_meal: "Во время еды",
  after_meal: "После еды",
  before_sleep: "Перед сном",
  fasting: "Натощак",
};

const TIME_CHIPS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

const NoteCell = ({ note }: { note: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="text-xs text-muted-foreground mt-0.5 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {expanded ? (
        note
      ) : (
        <span className="truncate block max-w-[180px]">{note}</span>
      )}
    </div>
  );
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
    route: string;
    foodRule: string;
    notes: string;
  } | null>(null);
  const [adminSlot, setAdminSlot] = useState<{
    slotId: string;
    doseGiven: string;
    notes: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, []);

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
    const sortedDates = Array.from(set)
      .map((s) => new Date(s))
      .sort((a, b) => a.getTime() - b.getTime());
    if (sortedDates.length > 0) {
      const lastDate = new Date(sortedDates[sortedDates.length - 1]);
      lastDate.setDate(lastDate.getDate() + 1);
      lastDate.setHours(0, 0, 0, 0);
      sortedDates.push(lastDate);
    }
    return sortedDates;
  })();

  if (prescriptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Нет активных назначений</p>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="prescription-grid-scroll overflow-auto flex-1 border rounded"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#888 #f1f1f1",
        }}
      >
        <style>{`
          .prescription-grid-scroll::-webkit-scrollbar {
            height: 10px;
            width: 10px;
          }
          .prescription-grid-scroll::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
          }
          .prescription-grid-scroll::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 4px;
          }
          .prescription-grid-scroll::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
        `}</style>
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="border p-1.5 text-left bg-white sticky left-0 z-20 w-6">
                #
              </th>
              <th className="border p-1.5 text-left bg-white sticky left-6 z-20 w-16">
                Дата
              </th>
              <th className="border p-1.5 text-left bg-white sticky left-[82px] z-20 min-w-48">
                НАЗНАЧЕНИЕ
              </th>
              <th className="border p-1.5 text-left bg-white sticky left-[274px] z-20 w-16">
                Врач
              </th>
              {allDateColumns.map((date, i) => {
                const isToday =
                  date.toDateString() === new Date().toDateString();
                return (
                  <th
                    key={i}
                    className={cn(
                      "border p-1.5 text-center min-w-24 font-medium",
                      isToday
                        ? "bg-blue-100 text-blue-700"
                        : "bg-muted/50 text-muted-foreground",
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
                  <td className="border p-1.5 text-center font-medium bg-white sticky left-0 z-10 w-6">
                    {pIdx + 1}
                  </td>
                  <td className="border p-1.5 bg-white sticky left-6 z-10 text-xs text-muted-foreground w-16">
                    {format(new Date(p.prescribed_at), "dd.MM")}
                    <div
                      className="text-muted-foreground"
                      style={{ fontSize: "10px" }}
                    >
                      {format(new Date(p.prescribed_at), "HH:mm")}
                    </div>
                  </td>
                  <td className="border p-1.5 bg-white sticky left-[82px] z-10 min-w-48">
                    <div className="font-medium">
                      {p.drug_formulary?.trade_name}{" "}
                      <span className="font-normal">
                        {p.dose}
                        {p.dose_unit}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ROUTES[p.route] ?? p.route}
                      {p.schedule_times?.length > 0 &&
                        ` · ${p.schedule_times.join(", ")}`}
                    </div>
                    {p.prescription_type === "prn" && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded">
                        PRN
                      </span>
                    )}
                    {p.prescription_type === "antibiotic_prophylaxis" && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-1 rounded">
                        Антибиотикопрофилактика
                      </span>
                    )}
                    {p.prn_condition && (
                      <div className="text-xs text-purple-700">
                        При: {p.prn_condition}
                      </div>
                    )}
                    {p.notes && <NoteCell note={p.notes} />}
                  </td>
                  <td className="border p-1.5 bg-white sticky left-[274px] z-10 text-xs text-muted-foreground w-16">
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
                    const isPastDate = isPast(date);

                    if (!inRange) {
                      return (
                        <td
                          key={di}
                          className={cn(
                            "border p-1.5 min-w-24 align-top bg-gray-50",
                            isToday ? "bg-blue-50/30" : "",
                          )}
                        >
                          {viewerRole === "physician" &&
                            !isReadOnly &&
                            !isPastDate && (
                              <button
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
                          isToday ? "bg-blue-50/30" : "",
                        )}
                      >
                        {viewerRole === "physician" && !isReadOnly && (
                          <div className="flex items-center gap-1 mb-1">
                            <button
                              title="Изменить"
                              className="p-0.5 rounded hover:bg-muted"
                              onClick={() => {
                                const s = daySlots[0];
                                if (s)
                                  setOverrideSlot({
                                    slotId: s.id,
                                    scheduledAt: format(
                                      new Date(s.scheduled_at),
                                      "HH:mm",
                                    ),
                                    dose:
                                      s.override_dose ??
                                      `${p.dose}${p.dose_unit ?? ""}`,
                                    route: p.route,
                                    foodRule: p.food_rule ?? "any",
                                    notes: "",
                                  });
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
                            {!isPastDate && daySlots.length === 0 && (
                              <button
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
                              <div className="text-green-700 text-xs">
                                ✅{" "}
                                {format(
                                  new Date(slot.administered_at),
                                  "HH:mm",
                                )}{" "}
                                {slot.dose_given}
                              </div>
                            ) : slot.status === "skipped" ? (
                              <div className="text-gray-400 line-through text-xs">
                                {format(new Date(slot.scheduled_at), "HH:mm")}
                              </div>
                            ) : (
                              <div>
                                <div className="text-orange-600 font-medium text-xs">
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
