import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  patientId: string;
  hospitalId: string;
  isReadOnly: boolean;
  currentUserId: string;
  documentId?: string | null;
}

const typeOptions = [
  { value: "drug", label: "Лекарство" },
  { value: "food", label: "Пища" },
  { value: "environmental", label: "Окружающая среда (пыльца, пыль и т.д.)" },
  { value: "other", label: "Другое" },
];

const severityOptions = [
  { value: "mild", label: "Легкая" },
  { value: "moderate", label: "Умеренная" },
  { value: "severe", label: "Тяжелая" },
  { value: "life_threatening", label: "Угрожающая жизни (анафилаксия)" },
];

const reactionOptions = [
  { value: "rash_hives", label: "Кожная реакция (сыпь, крапивница)" },
  { value: "swelling", label: "Отек" },
  { value: "breathing", label: "Затруднение дыхания" },
  { value: "anaphylaxis", label: "Анафилаксия" },
  { value: "gi", label: "Тошнота/рвота" },
  { value: "other", label: "Другое" },
];

const severityStyle: Record<string, string> = {
  mild: "bg-yellow-50 text-yellow-800 border-yellow-200",
  moderate: "bg-orange-50 text-orange-800 border-orange-200",
  severe: "bg-red-50 text-red-800 border-red-200",
  life_threatening: "bg-red-100 text-red-900 border-red-300",
};

export default function AllergyTab({ patientId, hospitalId, isReadOnly, currentUserId, documentId }: Props) {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  const [allergyType, setAllergyType] = useState("drug");
  const [description, setDescription] = useState("");
  const [drugSearch, setDrugSearch] = useState("");
  const [selectedDrug, setSelectedDrug] = useState<{ id: string; trade_name: string } | null>(null);
  const [severity, setSeverity] = useState("");
  const [reaction, setReaction] = useState("");
  const [reactionOther, setReactionOther] = useState("");

  const { data: allergies = [], refetch, error: allergiesError } = useQuery({
    queryKey: ["patient-allergies", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_allergies")
        .select("id, allergy_type, drug_id, description, severity, reaction, recorded_at, drug_formulary(trade_name)")
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  const { data: drugResults = [] } = useQuery({
    queryKey: ["allergy-drug-search", drugSearch],
    queryFn: async () => {
      if (!drugSearch.trim()) return [];
      const { data, error } = await supabase
        .from("drug_formulary")
        .select("id, trade_name")
        .ilike("trade_name", `%${drugSearch}%`)
        .limit(8);
      if (error) throw error;
      return data || [];
    },
    enabled: allergyType === "drug" && drugSearch.trim().length > 0,
  });

  const resetForm = () => {
    setAllergyType("drug");
    setDescription("");
    setDrugSearch("");
    setSelectedDrug(null);
    setSeverity("");
    setReaction("");
    setReactionOther("");
  };

  const handleAdd = async () => {
    const finalDescription = allergyType === "drug" ? selectedDrug?.trade_name : description.trim();
    if (!finalDescription || !severity || !reaction) {
      toast.error("Заполните тип, аллергию и тяжесть реакции.");
      return;
    }
    const finalReaction = reaction === "other" ? reactionOther.trim() : reactionOptions.find((r) => r.value === reaction)?.label;

    const { error } = await supabase.from("patient_allergies").insert({
      patient_id: patientId,
      hospital_id: hospitalId,
      allergy_type: allergyType,
      drug_id: allergyType === "drug" ? selectedDrug?.id ?? null : null,
      description: finalDescription,
      severity,
      reaction: finalReaction,
      recorded_by: currentUserId,
      patient_document_id: documentId ?? null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Аллергия добавлена.");
    resetForm();
    setShowAddForm(false);
    refetch();
    qc.invalidateQueries({ queryKey: ["patient-allergies", patientId] });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("patient_allergies").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetch();
    qc.invalidateQueries({ queryKey: ["patient-allergies", patientId] });
  };

  return (
    <div className="space-y-3">
      {allergiesError && (
        <p className="text-sm text-destructive">
          Ошибка загрузки аллергий: {(allergiesError as any)?.message}
        </p>
      )}
      {allergies.length === 0 ? (
        <p className="text-sm text-muted-foreground">Аллергии не зарегистрированы.</p>
      ) : (
        <div className="space-y-2">
          {allergies.map((a: any) => (
            <div
              key={a.id}
              className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${severityStyle[a.severity] ?? "bg-muted/30"}`}
            >
              <div className="space-y-0.5">
                <div className="font-medium">
                  {a.description}
                  <span className="ml-2 text-xs opacity-70">
                    ({typeOptions.find((t) => t.value === a.allergy_type)?.label ?? a.allergy_type})
                  </span>
                </div>
                <div className="text-xs opacity-80">
                  {severityOptions.find((s) => s.value === a.severity)?.label ?? a.severity}
                  {a.reaction ? ` — ${a.reaction}` : ""}
                </div>
              </div>
              {!isReadOnly && (
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                >
                  Удалить
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isReadOnly && (
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
          + Добавить аллергию
        </Button>
      )}

      <Dialog open={showAddForm} onOpenChange={(v) => { setShowAddForm(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить аллергию</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Тип</label>
              <Select value={allergyType} onValueChange={(v) => { setAllergyType(v); setSelectedDrug(null); setDescription(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {allergyType === "drug" ? (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Лекарство</label>
                {selectedDrug ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{selectedDrug.trade_name}</span>
                    <button onClick={() => setSelectedDrug(null)} className="text-xs text-muted-foreground hover:text-foreground">
                      Изменить
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={drugSearch}
                      onChange={(e) => setDrugSearch(e.target.value)}
                      placeholder="Поиск препарата..."
                    />
                    {drugResults.length > 0 && (
                      <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                        {drugResults.map((d: any) => (
                          <button
                            key={d.id}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                            onClick={() => { setSelectedDrug(d); setDrugSearch(""); }}
                          >
                            {d.trade_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {allergyType === "food" ? "Продукт" : allergyType === "environmental" ? "Аллерген" : "Описание"}
                </label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Например: арахис, пыльца..." />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Тяжесть реакции</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue placeholder="Выберите..." /></SelectTrigger>
                <SelectContent>
                  {severityOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Реакция</label>
              <Select value={reaction} onValueChange={setReaction}>
                <SelectTrigger><SelectValue placeholder="Выберите..." /></SelectTrigger>
                <SelectContent>
                  {reactionOptions.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reaction === "other" && (
                <Input value={reactionOther} onChange={(e) => setReactionOther(e.target.value)} placeholder="Опишите реакцию..." className="mt-1.5" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Отмена</Button>
            <Button onClick={handleAdd}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
