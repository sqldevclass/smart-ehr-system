import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PhysicianResultsTab from "@/components/physician/PhysicianResultsTab";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  userId: string;
  typeCode: "laboratory" | "consultation" | "instrumental";
  title: string;
  readOnly?: boolean;
}

export default function ServiceTab({
  hospitalizationId, patientId, hospitalId, userId, typeCode, title, readOnly,
}: Props) {
  const queryClient = useQueryClient();
  const isOutpatientMode = !hospitalizationId;
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [draft, setDraft] = useState<{ id: string; name: string }[]>([]);
  const [orderErrors, setOrderErrors] = useState<{ name: string; message: string }[]>([]);

  const toggleDraft = (service: { id: string; name: string }) => {
    setDraft((prev) =>
      prev.some((d) => d.id === service.id)
        ? prev.filter((d) => d.id !== service.id)
        : [...prev, { id: service.id, name: service.name }],
    );
  };

  const { data: items = [] } = useQuery({
    queryKey: ["inpatient-services", typeCode, hospitalizationId, patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, created_at, status_id,
          services!inner(name, service_type_id, service_group_id, service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .eq("source", "physician")
        .order("created_at", { ascending: false });
      return (data || []).filter(
        (vs: any) =>
          vs.services?.service_types?.code === typeCode &&
          ["ready_for_execution", "in_progress", "completed"].includes(
            vs.service_statuses?.code
          )
      );
    },
    enabled: !!patientId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-services", typeCode, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, code, cost_with_vat, service_type_id, service_group_id, service_types!inner(code), service_groups!inner(name)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return (data || []).filter(
        (s: any) => s.service_types?.code === typeCode
      );
    },
    enabled: !readOnly,
  });

  const labGroups = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((s: any) => {
      if (s.service_group_id) map.set(s.service_group_id, s.service_groups?.name || "—");
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [catalog]);

  useEffect(() => {
    if (typeCode === "laboratory" && !activeGroupId && labGroups.length > 0) {
      setActiveGroupId(labGroups[0].id);
    }
  }, [typeCode, labGroups, activeGroupId]);

  const filteredCatalog = useMemo(() => {
    if (typeCode !== "laboratory") return catalog;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      return catalog.filter(
        (s: any) =>
          s.name.toLowerCase().includes(q) ||
          (s.code && s.code.toLowerCase().includes(q)),
      );
    }
    return catalog.filter((s: any) => s.service_group_id === activeGroupId);
  }, [typeCode, catalog, searchText, activeGroupId]);

  const filteredItems = useMemo(() => {
    if (typeCode !== "laboratory" || !activeGroupId) return items;
    return items.filter(
      (vs: any) => vs.services?.service_group_id === activeGroupId,
    );
  }, [typeCode, items, activeGroupId]);

  const { data: favorites = [] } = useQuery({
    queryKey: ["physician-service-favorites", userId, typeCode],
    enabled: !readOnly,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_favorites")
        .select("service_id, use_count, services!inner(id, name, service_types!inner(code))")
        .eq("physician_id", userId)
        .not("service_id", "is", null)
        .order("use_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []).filter(
        (f: any) => f.services?.service_types?.code === typeCode
      );
    },
  });

  const handleOrder = async () => {
    if (!selectedServiceId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("inpatient_order_service", {
        p_hospitalization_id: hospitalizationId,
        p_patient_id: patientId,
        p_hospital_id: hospitalId,
        p_service_id: selectedServiceId,
        p_ordered_by: userId,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Назначено");
      setSelectedServiceId("");
      queryClient.invalidateQueries({ queryKey: ["inpatient-services", typeCode] });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOrderDraft = async () => {
    if (draft.length === 0) return;
    setSubmitting(true);
    setOrderErrors([]);
    const failures: { name: string; message: string }[] = [];
    const succeededIds: string[] = [];

    for (const item of draft) {
      const { error } = await supabase.rpc("inpatient_order_service", {
        p_hospitalization_id: hospitalizationId,
        p_patient_id: patientId,
        p_hospital_id: hospitalId,
        p_service_id: item.id,
        p_ordered_by: userId,
      });
      if (error) {
        failures.push({ name: item.name, message: error.message });
      } else {
        succeededIds.push(item.id);
      }
    }

    setDraft((prev) => prev.filter((d) => !succeededIds.includes(d.id)));
    setOrderErrors(failures);

    if (succeededIds.length > 0) {
      toast.success(`Назначено: ${succeededIds.length}`);
      queryClient.invalidateQueries({ queryKey: ["inpatient-services", typeCode] });
      queryClient.invalidateQueries({ queryKey: ["physician-service-favorites", userId, typeCode] });
    }
    if (failures.length > 0) {
      toast.error(`Не удалось назначить: ${failures.length}`);
    }
    setSubmitting(false);
  };

  const orderingAndList = (
    <>
      {!readOnly && typeCode === "laboratory" && labGroups.length > 0 && (
        <div className="flex gap-1 border-b overflow-x-auto">
          <button
            type="button"
            onClick={() => setShowResults(true)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-t whitespace-nowrap",
              showResults
                ? "border-b-2 border-green-500 font-medium text-green-600"
                : "text-green-600/70 hover:text-green-600",
            )}
          >
            Результаты
          </button>
          {labGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { setShowResults(false); setActiveGroupId(g.id); setSearchText(""); }}
              className={cn(
                "px-3 py-1.5 text-sm rounded-t whitespace-nowrap",
                !showResults && activeGroupId === g.id && !searchText
                  ? "border-b-2 border-primary font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {typeCode === "laboratory" && showResults && (
        <PhysicianResultsTab
          hospitalizationId={hospitalizationId}
          patientId={patientId}
          hospitalId={hospitalId}
        />
      )}

      {!(typeCode === "laboratory" && showResults) && <>


      {!readOnly && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          {typeCode === "laboratory" && (
            <Input
              placeholder="Поиск услуги..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 text-sm"
            />
          )}
          {typeCode === "laboratory" ? (
            <div className="max-h-72 overflow-y-auto border rounded bg-background divide-y">
              {filteredCatalog.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">Ничего не найдено</div>
              ) : (
                filteredCatalog.map((s: any) => {
                  const checked = draft.some((d) => d.id === s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleDraft({ id: s.id, name: s.name })}
                      />
                      <span className="flex-1">{s.name}</span>
                      {s.code && (
                        <span className="text-xs text-muted-foreground">{s.code}</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          ) : (
            <>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите услугу" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCatalog.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleOrder} disabled={!selectedServiceId || submitting}>
                  {submitting ? "..." : "Назначить"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!readOnly && typeCode === "laboratory" && draft.length > 0 && (
        <div className="border rounded p-3 space-y-2 bg-primary/5">
          <div className="text-xs uppercase text-muted-foreground">
            К назначению ({draft.length})
          </div>
          {draft.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span>{d.name}</span>
              <button
                type="button"
                onClick={() => setDraft((prev) => prev.filter((x) => x.id !== d.id))}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                Отменить
              </button>
            </div>
          ))}
          <Button size="sm" onClick={handleOrderDraft} disabled={submitting}>
            {submitting ? "..." : `Назначить (${draft.length})`}
          </Button>
        </div>
      )}

      {!readOnly && typeCode === "laboratory" && orderErrors.length > 0 && (
        <div className="border border-destructive/40 rounded p-3 space-y-1 bg-destructive/5">
          {orderErrors.map((e, i) => (
            <div key={i} className="text-xs text-destructive">
              {e.name}: {e.message}
            </div>
          ))}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет назначений.</p>
      ) : (
        <ul className="space-y-2">
          {filteredItems.map((vs: any) => (
            <li key={vs.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <div>
                <div className="font-medium">{vs.services?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(vs.created_at), "dd.MM.yyyy HH:mm")}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-muted">
                {vs.service_statuses?.name_ru || vs.service_statuses?.code}
              </span>
            </li>
          ))}
        </ul>
      )}
      </>}
    </>

  );

  const handleFavoriteClick = (f: any) => {
    if (typeCode === "laboratory") {
      toggleDraft({ id: f.service_id, name: f.services?.name });
    } else {
      setSelectedServiceId(f.service_id);
    }
  };

  const isFavoriteActive = (f: any) =>
    typeCode === "laboratory"
      ? draft.some((d) => d.id === f.service_id)
      : selectedServiceId === f.service_id;

  return (
    <div className="p-4 space-y-4">
      {typeCode !== "laboratory" && (
        <h3 className="font-semibold">{title}</h3>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
        <div className="space-y-4 min-w-0">
          {orderingAndList}
        </div>
        {!readOnly && !showResults && favorites.length > 0 && (
          <div className="border rounded p-3 space-y-1 bg-muted/20 h-fit">
            <div className="text-xs uppercase text-muted-foreground mb-2">
              Часто назначаемые
            </div>
            {favorites.map((f: any) => (
              <button
                key={f.service_id}
                type="button"
                onClick={() => handleFavoriteClick(f)}
                className={cn(
                  "w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted truncate",
                  isFavoriteActive(f) && "bg-muted font-medium",
                )}
                title={f.services?.name}
              >
                {f.services?.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
