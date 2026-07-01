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

const daysBetween = (a: Date, b: Date) =>
  Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

const nowIsoLocal = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
};

export default function DeviceMonitoringSection({
  hospitalizationId,
  patientId,
  hospitalId,
  isReadOnly = false,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [newDeviceTypeId, setNewDeviceTypeId] = useState("");
  const [newInsertedAt, setNewInsertedAt] = useState(nowIsoLocal());
  const [newSite, setNewSite] = useState("");

  // Per-device local UI state
  const [openChecklistFor, setOpenChecklistFor] = useState<string | null>(null);
  const [responses, setResponses] = useState<
    Record<string, Record<string, { answer: boolean; note?: string }>>
  >({});
  const [verifierByMonitor, setVerifierByMonitor] = useState<Record<string, string>>({});
  const [entryNotesByMonitor, setEntryNotesByMonitor] = useState<Record<string, string>>({});
  const [alertsByMonitor, setAlertsByMonitor] = useState<Record<string, string>>({});
  const [showAllHistoryFor, setShowAllHistoryFor] = useState<Record<string, boolean>>({});
  const [removingMonitorId, setRemovingMonitorId] = useState<string | null>(null);
  const [removeAt, setRemoveAt] = useState(nowIsoLocal());

  const { data: deviceTypes = [] } = useQuery({
    queryKey: ["device-monitoring-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_monitoring_types")
        .select("id, code, name_ru, monitoring_interval_days, requires_site")
        .order("name_ru");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["patient-device-monitors", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_device_monitors")
        .select(
          `id, device_type_id, site, inserted_at, removed_at, next_due_at,
           device_monitoring_types(id, code, name_ru, monitoring_interval_days, requires_site)`
        )
        .eq("hospitalization_id", hospitalizationId)
        .is("removed_at", null)
        .order("inserted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const activeDeviceTypeIds = useMemo(
    () => Array.from(new Set((devices as any[]).map((d) => d.device_type_id))),
    [devices],
  );

  const { data: criteria = [] } = useQuery({
    queryKey: ["device-monitoring-criteria", activeDeviceTypeIds],
    enabled: activeDeviceTypeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_monitoring_criteria")
        .select("id, device_type_id, code, name_ru, response_type, escalation_message, display_order")
        .in("device_type_id", activeDeviceTypeIds)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const criteriaByType = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const c of criteria as any[]) {
      (m[c.device_type_id] ||= []).push(c);
    }
    return m;
  }, [criteria]);

  const monitorIds = useMemo(() => (devices as any[]).map((d) => d.id), [devices]);

  const { data: entries = [] } = useQuery({
    queryKey: ["device-monitoring-entries", monitorIds],
    enabled: monitorIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_monitoring_entries")
        .select(
          `id, monitor_id, recorded_at, notes,
           verified_at,
           recorder:profiles!recorded_by(full_name),
           verifier:profiles!verified_by(full_name),
           device_monitoring_entry_responses(criterion_id, answer, note)`
        )
        .in("monitor_id", monitorIds)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const entriesByMonitor = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const e of entries as any[]) {
      (m[e.monitor_id] ||= []).push(e);
    }
    return m;
  }, [entries]);

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

  const handleAddDevice = async () => {
    const dt = (deviceTypes as any[]).find((t) => t.id === newDeviceTypeId);
    if (!dt) return;
    if (dt.requires_site && !newSite.trim()) {
      toast.error("Укажите место установки");
      return;
    }
    const insertedAtIso = new Date(newInsertedAt).toISOString();
    const nextDue = new Date(
      new Date(insertedAtIso).getTime() +
        (dt.monitoring_interval_days ?? 1) * 24 * 60 * 60 * 1000
    ).toISOString();
    const { error } = await supabase.from("patient_device_monitors").insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      device_type_id: newDeviceTypeId,
      site: dt.requires_site ? newSite.trim() : null,
      inserted_at: insertedAtIso,
      next_due_at: nextDue,
      created_by: user!.id,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Устройство добавлено");
    setShowAdd(false);
    setNewDeviceTypeId("");
    setNewSite("");
    setNewInsertedAt(nowIsoLocal());
    queryClient.invalidateQueries({ queryKey: ["patient-device-monitors", hospitalizationId] });
  };

  const handleSubmitEntry = async (monitor: any) => {
    const items = criteriaByType[monitor.device_type_id] || [];
    const respMap = responses[monitor.id] || {};
    const payload = items.map((c: any) => ({
      criterion_id: c.id,
      answer: respMap[c.id]?.answer ?? false,
      note: respMap[c.id]?.note ?? null,
    }));
    const verifier = verifierByMonitor[monitor.id] || null;
    const { data, error } = await supabase.rpc("submit_device_monitoring_entry", {
      p_monitor_id: monitor.id,
      p_hospital_id: hospitalId,
      p_responses: payload,
      p_notes: entryNotesByMonitor[monitor.id] || null,
      p_verified_by: verifier,
    } as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result: any = Array.isArray(data) ? data[0] : data;
    if (result?.alert_id) {
      const failing = items.find((c: any) => !(respMap[c.id]?.answer ?? false));
      setAlertsByMonitor((p) => ({
        ...p,
        [monitor.id]: failing?.escalation_message || "Требуется вмешательство",
      }));
    } else {
      setAlertsByMonitor((p) => {
        const n = { ...p };
        delete n[monitor.id];
        return n;
      });
    }
    toast.success("Оценка сохранена");
    setResponses((p) => ({ ...p, [monitor.id]: {} }));
    setEntryNotesByMonitor((p) => ({ ...p, [monitor.id]: "" }));
    setOpenChecklistFor(null);
    queryClient.invalidateQueries({ queryKey: ["patient-device-monitors", hospitalizationId] });
    queryClient.invalidateQueries({ queryKey: ["device-monitoring-entries", monitorIds] });
  };

  const handleRemoveDevice = async (monitorId: string) => {
    const { error } = await supabase
      .from("patient_device_monitors")
      .update({ removed_at: new Date(removeAt).toISOString() })
      .eq("id", monitorId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Устройство помечено как удалённое");
    setRemovingMonitorId(null);
    setRemoveAt(nowIsoLocal());
    queryClient.invalidateQueries({ queryKey: ["patient-device-monitors", hospitalizationId] });
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
            <Select value={newDeviceTypeId} onValueChange={setNewDeviceTypeId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                {(deviceTypes as any[]).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name_ru}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Дата и время установки</Label>
            <Input
              type="datetime-local"
              value={newInsertedAt}
              onChange={(e) => setNewInsertedAt(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {(() => {
            const dt = (deviceTypes as any[]).find((t) => t.id === newDeviceTypeId);
            if (!dt?.requires_site) return null;
            return (
              <div>
                <Label className="text-xs">Место установки</Label>
                <Input
                  value={newSite}
                  onChange={(e) => setNewSite(e.target.value)}
                  placeholder="Напр., правая внутренняя яремная вена"
                  className="h-8 text-sm"
                />
              </div>
            );
          })()}
          <Button size="sm" onClick={handleAddDevice} disabled={!newDeviceTypeId}>
            Сохранить
          </Button>
        </div>
      )}

      {(devices as any[]).length === 0 ? (
        <p className="text-xs text-muted-foreground">Нет активных устройств</p>
      ) : (
        (devices as any[]).map((d) => {
          const dt = d.device_monitoring_types;
          const daysSince = daysBetween(new Date(d.inserted_at), new Date());
          const isOverdue = d.next_due_at && new Date(d.next_due_at) < new Date();
          const items = criteriaByType[d.device_type_id] || [];
          const monitorEntries = entriesByMonitor[d.id] || [];
          const showAll = showAllHistoryFor[d.id];
          const historyToShow = showAll ? monitorEntries : monitorEntries.slice(0, 5);
          const alertMsg = alertsByMonitor[d.id];
          const verifierId = verifierByMonitor[d.id] || "";
          const verifierProfile = (profiles as any[]).find((p) => p.id === verifierId);
          const verifierIsEpi = false; // no epi role yet
          const isOpen = openChecklistFor === d.id;

          return (
            <div key={d.id} className="border rounded-md p-3 space-y-2 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{dt?.name_ru}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.site && <span>Место: {d.site} · </span>}
                    Установлено {daysSince} дн. назад
                    {isOverdue && (
                      <span className="ml-2 text-red-700 font-medium">
                        · Проверка просрочена
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!isReadOnly && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setOpenChecklistFor(isOpen ? null : d.id)}
                      >
                        {isOpen ? "Скрыть" : "+ Проверка"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-red-700 border-red-300"
                        onClick={() => setRemovingMonitorId(d.id)}
                      >
                        Отметить как удалено
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {alertMsg && (
                <div className="rounded border border-red-300 bg-red-50 text-red-800 text-xs p-2">
                  {alertMsg}
                </div>
              )}

              {removingMonitorId === d.id && (
                <div className="bg-muted/20 p-2 rounded space-y-2">
                  <Label className="text-xs">Дата и время удаления</Label>
                  <Input
                    type="datetime-local"
                    value={removeAt}
                    onChange={(e) => setRemoveAt(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleRemoveDevice(d.id)}>
                      Подтвердить удаление
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRemovingMonitorId(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {isOpen && (
                <div className="space-y-2 bg-muted/20 p-3 rounded">
                  {items.map((c: any) => {
                    const r = responses[d.id]?.[c.id];
                    const answer = r?.answer;
                    return (
                      <div key={c.id} className="border rounded p-2 bg-white space-y-1.5">
                        <div className="text-xs font-medium">{c.name_ru}</div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={answer === true ? "default" : "outline"}
                            className={cn(
                              "h-7 text-xs",
                              answer === true && "bg-green-600 hover:bg-green-700"
                            )}
                            onClick={() =>
                              setResponses((p) => ({
                                ...p,
                                [d.id]: {
                                  ...(p[d.id] || {}),
                                  [c.id]: { ...(p[d.id]?.[c.id] || {}), answer: true },
                                },
                              }))
                            }
                          >
                            + В норме
                          </Button>
                          <Button
                            size="sm"
                            variant={answer === false ? "default" : "outline"}
                            className={cn(
                              "h-7 text-xs",
                              answer === false && "bg-red-600 hover:bg-red-700"
                            )}
                            onClick={() =>
                              setResponses((p) => ({
                                ...p,
                                [d.id]: {
                                  ...(p[d.id] || {}),
                                  [c.id]: { ...(p[d.id]?.[c.id] || {}), answer: false },
                                },
                              }))
                            }
                          >
                            − Проблема
                          </Button>
                        </div>
                        {c.response_type === "boolean_with_note" && (
                          <Input
                            placeholder="Комментарий"
                            className="h-7 text-xs"
                            value={r?.note ?? ""}
                            onChange={(e) =>
                              setResponses((p) => ({
                                ...p,
                                [d.id]: {
                                  ...(p[d.id] || {}),
                                  [c.id]: {
                                    ...(p[d.id]?.[c.id] || { answer: false }),
                                    note: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}

                  <div>
                    <Label className="text-xs">Проверил (эпидемиолог)</Label>
                    <Select
                      value={verifierId}
                      onValueChange={(v) =>
                        setVerifierByMonitor((p) => ({ ...p, [d.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Выберите сотрудника" />
                      </SelectTrigger>
                      <SelectContent>
                        {(profiles as any[]).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {verifierProfile && !verifierIsEpi && (
                      <div className="text-[11px] text-yellow-700 mt-1">
                        ⚠ Выбранный сотрудник не отмечен как эпидемиолог
                      </div>
                    )}
                  </div>

                  <Textarea
                    placeholder="Примечания (необязательно)"
                    rows={2}
                    value={entryNotesByMonitor[d.id] || ""}
                    onChange={(e) =>
                      setEntryNotesByMonitor((p) => ({ ...p, [d.id]: e.target.value }))
                    }
                    className="text-sm"
                  />

                  <Button size="sm" onClick={() => handleSubmitEntry(d)}>
                    Сохранить проверку
                  </Button>
                </div>
              )}

              {monitorEntries.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">История</p>
                  {historyToShow.map((e: any) => {
                    const failing = (e.device_monitoring_entry_responses || []).filter(
                      (r: any) => r.answer === false
                    );
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "text-xs border rounded p-2",
                          failing.length > 0
                            ? "border-red-200 bg-red-50"
                            : "border-green-200 bg-green-50"
                        )}
                      >
                        <div className="flex justify-between">
                          <span>
                            {new Date(e.recorded_at).toLocaleString("ru-RU")}
                            {e.recorder?.full_name && ` · ${e.recorder.full_name}`}
                          </span>
                          <span>
                            {failing.length === 0
                              ? "Всё в норме"
                              : `Проблем: ${failing.length}`}
                          </span>
                        </div>
                        {e.verifier?.full_name && (
                          <div className="opacity-75">
                            Проверил: {e.verifier.full_name}
                          </div>
                        )}
                        {e.notes && <div className="mt-0.5">{e.notes}</div>}
                      </div>
                    );
                  })}
                  {monitorEntries.length > 5 && (
                    <button
                      onClick={() =>
                        setShowAllHistoryFor((p) => ({ ...p, [d.id]: !showAll }))
                      }
                      className="text-xs text-primary underline"
                    >
                      {showAll
                        ? "Скрыть"
                        : `Показать ещё (${monitorEntries.length - 5})`}
                    </button>
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
