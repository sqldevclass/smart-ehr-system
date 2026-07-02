import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  isReadOnly?: boolean;
}

type Criterion = {
  code: string;
  label: string;
  critical?: boolean;
  criticalMessage?: string;
  hasNote?: boolean;
  notePlaceholder?: string;
};

type FormDef = {
  label: string;
  intervalDays: number;
  hasSite: boolean;
  siteOptions?: string[];
  criteria: Criterion[];
};

const DEVICE_FORMS: Record<string, FormDef> = {
  cvc: {
    label: "Мониторинг центрального венозного катетера",
    intervalDays: 3,
    hasSite: true,
    siteOptions: ["яремная вена", "подключичная вена", "бедренная вена"],
    criteria: [
      { code: "cvc_1", label: "Необходимость ЦВК обоснована, есть необходимость в ЦВК. Отметка в дневнике врача" },
      { code: "cvc_2", label: "Обработка рук антисептиком производится каждый раз (до и после) контакта с ЦВК (при использовании)" },
      { code: "cvc_3", label: "Место пункции (кожа) и наружная часть катетера (хаб, порт) обрабатывается 70% спиртом (или 2% раствором хлоргексидина) при каждом доступе, при каждом использовании" },
      { code: "cvc_4", label: "Повязка над ЦВК была заменена в последние 5 суток. Кожа вокруг ЦВК была обработана антисептиком (спирт или хлоргексидин) перед заменой повязки" },
      { code: "cvc_5", label: "Имеются ли боль, покраснение, отечность кожи в области ЦВК?", critical: true, criticalMessage: "Сообщить в службу инфекционного контроля" },
    ],
  },
  tracheostomy: {
    label: "Мониторинг трахеостомы",
    intervalDays: 3,
    hasSite: false,
    criteria: [
      { code: "trach_1", label: "Проверка нужна ли трахеостома у данного пациента проведена врачом (обоснованность нахождения)" },
      { code: "trach_2", label: "Трахеостома закреплена должным образом" },
      { code: "trach_3", label: "Кожа вокруг трахеостомы чистая, края раны не отечны и не гиперемированы" },
      { code: "trach_4", label: "Трахеостома регулярно промывается изотоническим раствором" },
      { code: "trach_5", label: "Кожа вокруг трахеостомы обработана антисептиком (спирт или хлоргексидин)" },
      { code: "trach_6", label: "Вокруг трахеостомы на кожу наложена асептическая повязка" },
      { code: "trach_7", label: "В случае признаков воспаления вокруг трахеостомы, взят мазок на бакпосев", hasNote: true, notePlaceholder: "Отметить в какой день" },
    ],
  },
  ventilator: {
    label: "Мониторинг пациента на ИВЛ",
    intervalDays: 1,
    hasSite: false,
    criteria: [
      { code: "ivl_1", label: "Головной конец кровати поднят под углом 30-45 градусов (если нет противопоказаний)" },
      { code: "ivl_2", label: "Ежедневно проводится временное отключение седативных препаратов" },
      { code: "ivl_3", label: "Ежедневно проверяется готовность к экстубации" },
      { code: "ivl_4", label: "Пациенту на ИВЛ проводится инфузия H2-гистаминоблокатора или ингибитора протонной помпы (если нет противопоказаний)" },
      { code: "ivl_5", label: "Ежедневно ротовая полость обрабатывается раствором Хлоргексидина (0,05-0,12%)" },
      { code: "ivl_6", label: "Выполняется профилактика пролежней (+ оценка по шкале Брадена)" },
      { code: "ivl_7", label: "Профилактика тромбоза глубоких вен выполняется" },
    ],
  },
  urinary_catheter: {
    label: "Мониторинг мочевого катетера",
    intervalDays: 1,
    hasSite: false,
    // NOTE: source form skips #6 — numbering below is intentional.
    criteria: [
      { code: "uc_1", label: "Мочевой катетер необходим для данного пациента?" },
      { code: "uc_2", label: "Катетер закреплен должным образом к пациенту" },
      { code: "uc_3", label: "Моча беспрепятственно вытекает из катетера в мешок?" },
      { code: "uc_4", label: "Мешок для сбора ниже уровня мочевого пузыря?" },
      { code: "uc_5", label: "Мешок и трубка на некотором удалении от пола (не касаются пола)?" },
      { code: "uc_7", label: "Мочеприемник регулярно опорожняется" },
    ],
  },
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const daysBetween = (a: string, b: Date) => {
  const d1 = new Date(a);
  return Math.max(0, Math.floor((b.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
};

type DraftDevice = {
  key: string;
  form_type: string;
  device_label: string;
  inserted_at: string;
};

type DeviceKey = { form_type: string; device_label: string; inserted_at: string };
const keyOf = (form_type: string, device_label: string | null) =>
  `${form_type}::${device_label ?? ""}`;

export default function DeviceMonitoringSection({
  hospitalizationId,
  patientId,
  hospitalId,
  isReadOnly = false,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Add-device local state
  const [showAdd, setShowAdd] = useState(false);
  const [newFormType, setNewFormType] = useState<string>("");
  const [newInsertedAt, setNewInsertedAt] = useState(todayIso());
  const [newSite, setNewSite] = useState("");
  const [drafts, setDrafts] = useState<DraftDevice[]>([]);

  // Per-device UI state, keyed by device key
  const [openChecklistFor, setOpenChecklistFor] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, Record<string, boolean>>>({});
  const [criterionNotes, setCriterionNotes] = useState<Record<string, Record<string, string>>>({});
  const [entryNotes, setEntryNotes] = useState<Record<string, string>>({});
  const [verifierByKey, setVerifierByKey] = useState<Record<string, string>>({});
  const [alertByKey, setAlertByKey] = useState<Record<string, string>>({});
  const [showAllByKey, setShowAllByKey] = useState<Record<string, boolean>>({});
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removeAt, setRemoveAt] = useState(todayIso());

  const { data: records = [] } = useQuery({
    queryKey: ["nurse-device-monitoring", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nurse_device_monitoring_records" as any)
        .select("*")
        .eq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-verifier", hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("hospital_id", hospitalId)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Group records by (form_type, device_label). A device is "removed" if
  // its latest record has removed_at set.
  const deviceGroups = useMemo(() => {
    const map = new Map<
      string,
      { form_type: string; device_label: string | null; inserted_at: string; entries: any[] }
    >();
    for (const r of records as any[]) {
      const k = keyOf(r.form_type, r.device_label);
      const g = map.get(k);
      if (!g) {
        map.set(k, {
          form_type: r.form_type,
          device_label: r.device_label,
          inserted_at: r.inserted_at,
          entries: [r],
        });
      } else {
        g.entries.push(r);
        if (r.inserted_at && (!g.inserted_at || r.inserted_at < g.inserted_at)) {
          g.inserted_at = r.inserted_at;
        }
      }
    }
    // Filter out removed devices (latest entry has removed_at)
    return Array.from(map.entries())
      .filter(([, g]) => !(g.entries[0]?.removed_at))
      .map(([k, g]) => ({ key: k, ...g }));
  }, [records]);

  const activeKeys = useMemo(() => new Set(deviceGroups.map((g) => g.key)), [deviceGroups]);

  // All cards = existing devices + drafts not yet persisted
  const allCards = useMemo(() => {
    const existing = deviceGroups.map((g) => ({
      key: g.key,
      form_type: g.form_type,
      device_label: g.device_label ?? "",
      inserted_at: g.inserted_at,
      entries: g.entries,
      isDraft: false,
    }));
    const draftCards = drafts
      .filter((d) => !activeKeys.has(keyOf(d.form_type, d.device_label)))
      .map((d) => ({
        key: keyOf(d.form_type, d.device_label),
        form_type: d.form_type,
        device_label: d.device_label,
        inserted_at: d.inserted_at,
        entries: [] as any[],
        isDraft: true,
      }));
    return [...draftCards, ...existing];
  }, [deviceGroups, drafts, activeKeys]);

  const handleAddDevice = () => {
    if (!newFormType) {
      toast.error("Выберите тип устройства");
      return;
    }
    const def = DEVICE_FORMS[newFormType];
    if (def.hasSite && !newSite.trim()) {
      toast.error("Укажите место установки");
      return;
    }
    const label = def.hasSite ? newSite.trim() : "";
    const k = keyOf(newFormType, label);
    if (activeKeys.has(k) || drafts.some((d) => keyOf(d.form_type, d.device_label) === k)) {
      toast.error("Такое устройство уже добавлено");
      return;
    }
    setDrafts((p) => [
      ...p,
      { key: k, form_type: newFormType, device_label: label, inserted_at: newInsertedAt },
    ]);
    setShowAdd(false);
    setNewFormType("");
    setNewSite("");
    setNewInsertedAt(todayIso());
    setOpenChecklistFor(k);
  };

  const handleSubmit = async (card: {
    key: string;
    form_type: string;
    device_label: string;
    inserted_at: string;
    isDraft: boolean;
  }) => {
    const def = DEVICE_FORMS[card.form_type];
    if (!def) return;
    const resp = responses[card.key] || {};
    const responsesPayload: Record<string, boolean> = {};
    for (const c of def.criteria) {
      responsesPayload[c.code] = !!resp[c.code];
    }
    // Attach note fields inside responses if any criterion hasNote
    const notesMap = criterionNotes[card.key] || {};
    for (const c of def.criteria) {
      if (c.hasNote && notesMap[c.code]) {
        (responsesPayload as any)[`${c.code}_note`] = notesMap[c.code];
      }
    }
    let criticality = false;
    let criticalMsg = "";
    for (const c of def.criteria) {
      if (c.critical && responsesPayload[c.code]) {
        criticality = true;
        criticalMsg = c.criticalMessage || "Требуется вмешательство";
        break;
      }
    }
    const verifier = verifierByKey[card.key] || null;
    const { error } = await supabase.from("nurse_device_monitoring_records" as any).insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      form_type: card.form_type,
      device_label: card.device_label || null,
      inserted_at: card.inserted_at,
      responses: responsesPayload,
      criticality_flag: criticality,
      notes: entryNotes[card.key] || null,
      recorded_by: user?.id ?? null,
      recorded_at: new Date().toISOString(),
      verified_by: verifier,
      verified_at: verifier ? new Date().toISOString() : null,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Запись сохранена");
    setResponses((p) => ({ ...p, [card.key]: {} }));
    setCriterionNotes((p) => ({ ...p, [card.key]: {} }));
    setEntryNotes((p) => ({ ...p, [card.key]: "" }));
    if (criticality) {
      setAlertByKey((p) => ({ ...p, [card.key]: criticalMsg }));
    } else {
      setAlertByKey((p) => {
        const n = { ...p };
        delete n[card.key];
        return n;
      });
    }
    setOpenChecklistFor(null);
    if (card.isDraft) {
      setDrafts((p) => p.filter((d) => keyOf(d.form_type, d.device_label) !== card.key));
    }
    queryClient.invalidateQueries({ queryKey: ["nurse-device-monitoring", hospitalizationId] });
  };

  const handleRemove = async (card: {
    key: string;
    form_type: string;
    device_label: string;
    inserted_at: string;
    isDraft: boolean;
  }) => {
    if (card.isDraft) {
      setDrafts((p) => p.filter((d) => keyOf(d.form_type, d.device_label) !== card.key));
      setRemovingKey(null);
      return;
    }
    const { error } = await supabase.from("nurse_device_monitoring_records" as any).insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      form_type: card.form_type,
      device_label: card.device_label || null,
      inserted_at: card.inserted_at,
      removed_at: removeAt,
      responses: {},
      criticality_flag: false,
      notes: "Устройство удалено",
      recorded_by: user?.id ?? null,
      recorded_at: new Date().toISOString(),
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Устройство помечено как удалённое");
    setRemovingKey(null);
    setRemoveAt(todayIso());
    queryClient.invalidateQueries({ queryKey: ["nurse-device-monitoring", hospitalizationId] });
  };

  return (
    <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Мониторинг устройств</h4>
        <Button
          size="sm"
          variant="outline"
          className="text-xs"
          onClick={() => setShowAdd(!showAdd)}
          disabled={isReadOnly}
        >
          {showAdd ? "Отмена" : "+ Добавить устройство"}
        </Button>
      </div>

      {showAdd && (
        <div className="space-y-2 bg-muted/20 p-3 rounded-md">
          <div>
            <Label className="text-xs">Тип устройства</Label>
            <Select value={newFormType} onValueChange={(v) => { setNewFormType(v); setNewSite(""); }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEVICE_FORMS).map(([code, def]) => (
                  <SelectItem key={code} value={code}>
                    {def.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Дата установки</Label>
            <Input
              type="date"
              value={newInsertedAt}
              onChange={(e) => setNewInsertedAt(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {newFormType && DEVICE_FORMS[newFormType]?.hasSite && (
            <div>
              <Label className="text-xs">Место установки</Label>
              <Select value={newSite} onValueChange={setNewSite}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Выберите место" />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_FORMS[newFormType].siteOptions!.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button size="sm" onClick={handleAddDevice} disabled={!newFormType}>
            Добавить
          </Button>
        </div>
      )}

      {allCards.length === 0 ? (
        <p className="text-xs text-muted-foreground">Нет активных устройств</p>
      ) : (
        allCards.map((card) => {
          const def = DEVICE_FORMS[card.form_type];
          if (!def) return null;
          const daysSince = daysBetween(card.inserted_at, new Date());
          const showAll = showAllByKey[card.key];
          const historyToShow = showAll ? card.entries : card.entries.slice(0, 5);
          const alertMsg = alertByKey[card.key];
          const verifierId = verifierByKey[card.key] || "";
          const verifierProfile = (profiles as any[]).find((p) => p.id === verifierId);
          const isOpen = openChecklistFor === card.key;
          const resp = responses[card.key] || {};
          const cNotes = criterionNotes[card.key] || {};

          return (
            <div key={card.key} className="border rounded-md p-3 space-y-2 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {def.label}
                    {card.isDraft && (
                      <span className="ml-2 text-[10px] uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        черновик
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {card.device_label && <span>Место: {card.device_label} · </span>}
                    Установлено {daysSince} дн. назад · интервал {def.intervalDays} дн.
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isReadOnly && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setOpenChecklistFor(isOpen ? null : card.key)}
                      >
                        {isOpen ? "Скрыть" : "+ Проверка"}
                      </Button>
                      {!card.isDraft && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs text-red-700 border-red-300"
                          onClick={() => setRemovingKey(card.key)}
                        >
                          Отметить как удалено
                        </Button>
                      )}
                      {card.isDraft && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-red-700"
                          onClick={() =>
                            setDrafts((p) =>
                              p.filter((d) => keyOf(d.form_type, d.device_label) !== card.key),
                            )
                          }
                        >
                          Удалить черновик
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {alertMsg && (
                <div className="rounded border border-red-300 bg-red-50 text-red-800 text-xs p-2">
                  ⚠ {alertMsg}
                </div>
              )}

              {removingKey === card.key && (
                <div className="bg-muted/20 p-2 rounded space-y-2">
                  <Label className="text-xs">Дата удаления</Label>
                  <Input
                    type="date"
                    value={removeAt}
                    onChange={(e) => setRemoveAt(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleRemove(card)}>
                      Подтвердить удаление
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemovingKey(null)}>
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {isOpen && !isReadOnly && (
                <div className="space-y-2 bg-muted/20 p-3 rounded">
                  {def.criteria.map((c) => {
                    const answer = resp[c.code];
                    return (
                      <div key={c.code} className="border rounded p-2 bg-white space-y-1.5">
                        <div className="text-xs font-medium">{c.label}</div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={answer === true ? "default" : "outline"}
                            className={cn(
                              "h-7 text-xs",
                              answer === true && "bg-green-600 hover:bg-green-700",
                            )}
                            onClick={() =>
                              setResponses((p) => ({
                                ...p,
                                [card.key]: { ...(p[card.key] || {}), [c.code]: true },
                              }))
                            }
                          >
                            + Да
                          </Button>
                          <Button
                            size="sm"
                            variant={answer === false ? "default" : "outline"}
                            className={cn(
                              "h-7 text-xs",
                              answer === false && "bg-red-600 hover:bg-red-700",
                            )}
                            onClick={() =>
                              setResponses((p) => ({
                                ...p,
                                [card.key]: { ...(p[card.key] || {}), [c.code]: false },
                              }))
                            }
                          >
                            − Нет
                          </Button>
                        </div>
                        {c.hasNote && (
                          <Input
                            placeholder={c.notePlaceholder || "Комментарий"}
                            className="h-7 text-xs"
                            value={cNotes[c.code] || ""}
                            onChange={(e) =>
                              setCriterionNotes((p) => ({
                                ...p,
                                [card.key]: { ...(p[card.key] || {}), [c.code]: e.target.value },
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                  <div>
                    <Label className="text-xs">Комментарий</Label>
                    <Textarea
                      value={entryNotes[card.key] || ""}
                      onChange={(e) =>
                        setEntryNotes((p) => ({ ...p, [card.key]: e.target.value }))
                      }
                      className="text-sm min-h-[60px]"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Проверил</Label>
                    <Select
                      value={verifierId}
                      onValueChange={(v) =>
                        setVerifierByKey((p) => ({ ...p, [card.key]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Не выбрано" />
                      </SelectTrigger>
                      <SelectContent>
                        {(profiles as any[]).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {verifierProfile && (
                      <div className="text-[11px] text-amber-700 mt-1">
                        ⚠ не отмечен как эпидемиолог
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => handleSubmit(card)}>
                    Сохранить оценку
                  </Button>
                </div>
              )}

              {card.entries.length > 0 && (
                <div className="pt-2 border-t space-y-1">
                  <div className="text-[11px] text-muted-foreground font-medium">История</div>
                  {historyToShow.map((e: any) => (
                    <div key={e.id} className="text-xs flex items-center gap-2">
                      <span className="text-muted-foreground w-32">
                        {new Date(e.recorded_at).toLocaleString("ru-RU")}
                      </span>
                      {e.criticality_flag && (
                        <span className="text-red-700 font-medium">⚠ критично</span>
                      )}
                      {e.removed_at && (
                        <span className="text-muted-foreground">удалено {e.removed_at}</span>
                      )}
                      {e.notes && <span className="text-muted-foreground truncate">· {e.notes}</span>}
                    </div>
                  ))}
                  {card.entries.length > 5 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-6 px-2"
                      onClick={() =>
                        setShowAllByKey((p) => ({ ...p, [card.key]: !p[card.key] }))
                      }
                    >
                      {showAll ? "Скрыть" : `Показать все (${card.entries.length})`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
