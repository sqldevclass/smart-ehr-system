import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  visitServiceId: string;
  documentTypeId: string | null;
  patientId: string;
  hospitalizationId: string | null;
  hospitalId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentForm(props: Props) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(props.documentTypeId);

  return (
    <Sheet open={true} onOpenChange={(o) => { if (!o) props.onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {!selectedTypeId ? (
          <TypePicker
            hospitalId={props.hospitalId}
            onSelect={(id) => setSelectedTypeId(id)}
          />
        ) : (
          <DocumentEditor
            {...props}
            documentTypeId={selectedTypeId}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function TypePicker({ hospitalId, onSelect }: { hospitalId: string; onSelect: (id: string) => void }) {
  const { data: types = [] } = useQuery({
    queryKey: ["document-types-outpatient", hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color, setting, is_active, hospital_id")
        .in("setting", ["outpatient", "both"])
        .or(`hospital_id.is.null,hospital_id.eq.${hospitalId}`)
        .eq("is_active", true)
        .order("name_ru");
      return data || [];
    },
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Выберите тип документа</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-2">
        {types.length === 0 && (
          <p className="text-sm text-muted-foreground">Нет доступных типов документов.</p>
        )}
        {types.map((t: any) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className="w-full rounded border bg-card p-3 text-left text-sm transition hover:bg-accent"
            style={{ borderLeft: `4px solid ${t.color || "hsl(var(--primary))"}` }}
          >
            {t.name_ru}
          </button>
        ))}
      </div>
    </>
  );
}

function DocumentEditor({
  visitServiceId, documentTypeId, patientId, hospitalizationId, hospitalId, onSaved,
}: Props & { documentTypeId: string }) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [criticalityFlag, setCriticalityFlag] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const { data: docType } = useQuery({
    queryKey: ["document-type", documentTypeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color, requires_second_sig")
        .eq("id", documentTypeId)
        .single();
      return data;
    },
  });

  const { data: rawSections = [] } = useQuery({
    queryKey: ["document-type-sections", documentTypeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_type_sections")
        .select(`
          sort_order,
          document_sections!inner(id, code, name_ru),
          document_type_fields!inner(
            sort_order, is_mandatory, is_visible,
            field_definitions!inner(
              id, attribute_code, label_ru,
              field_type, options, unit
            )
          )
        `)
        .eq("document_type_id", documentTypeId)
        .order("sort_order");
      return data || [];
    },
  });

  const sections = useMemo(() => {
    return [...(rawSections as any[])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s: any) => ({
        id: s.document_sections.id,
        name_ru: s.document_sections.name_ru,
        fields: [...(s.document_type_fields ?? [])]
          .filter((f: any) => f.is_visible !== false)
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((f: any) => ({
            is_mandatory: f.is_mandatory,
            def: f.field_definitions,
          })),
      }));
  }, [rawSections]);

  const allMandatoryFilled = useMemo(() => {
    for (const s of sections) {
      for (const f of s.fields) {
        if (f.is_mandatory) {
          const v = values[f.def.id];
          if (v === undefined || v === null || String(v).trim() === "") return false;
        }
      }
    }
    return true;
  }, [sections, values]);

  const setVal = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));

  const handleSave = async (): Promise<string | null> => {
    if (!user) return null;
    setIsSaving(true);
    try {
      let docId = documentId;
      if (!docId) {
        const { data: doc, error } = await supabase
          .from("patient_documents")
          .insert({
            patient_id: patientId,
            hospitalization_id: hospitalizationId,
            hospital_id: hospitalId,
            document_type_id: documentTypeId,
            visit_service_id: visitServiceId,
            status: "preliminary",
            criticality_flag: criticalityFlag,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) { toast.error(error.message); return null; }
        docId = doc!.id;
        setDocumentId(docId);
      } else {
        await supabase
          .from("patient_documents")
          .update({ criticality_flag: criticalityFlag })
          .eq("id", docId);
      }

      const rows = Object.entries(values).map(([fieldId, value]) => ({
        patient_document_id: docId!,
        field_definition_id: fieldId,
        hospital_id: hospitalId,
        value,
        recorded_by: user.id,
      }));
      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("patient_document_field_values")
          .upsert(rows, { onConflict: "patient_document_id,field_definition_id" });
        if (upErr) { toast.error(upErr.message); return null; }
      }
      toast.success("Сохранено");
      return docId;
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const docId = await handleSave();
      if (!docId) return;
      const { error } = await supabase.rpc("complete_document", { p_document_id: docId });
      if (error) { toast.error(error.message); return; }
      toast.success("Документ подтверждён");
      onSaved();
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm = criticalityFlag && allMandatoryFilled && documentId !== null && !isSaving && !isConfirming;

  return (
    <>
      <SheetHeader>
        <SheetTitle style={{ color: docType?.color || undefined }}>
          {docType?.name_ru || "Документ"}
        </SheetTitle>
      </SheetHeader>

      <div className="mt-4">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет полей для заполнения.</p>
        ) : (
          <Tabs defaultValue={sections[0].id}>
            <TabsList className="flex flex-wrap h-auto">
              {sections.map((s) => (
                <TabsTrigger key={s.id} value={s.id}>{s.name_ru}</TabsTrigger>
              ))}
            </TabsList>
            {sections.map((s) => (
              <TabsContent key={s.id} value={s.id} className="space-y-4 pt-4">
                {s.fields.map((f) => (
                  <FieldRow
                    key={f.def.id}
                    def={f.def}
                    isMandatory={f.is_mandatory}
                    value={values[f.def.id] ?? ""}
                    onChange={(v) => setVal(f.def.id, v)}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      <SheetFooter className="mt-6 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="criticality-flag"
            checked={criticalityFlag}
            onCheckedChange={setCriticalityFlag}
          />
          <Label htmlFor="criticality-flag">Критичность</Label>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave()} disabled={isSaving}>
            Сохранить
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Подтвердить
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

function FieldRow({
  def, isMandatory, value, onChange,
}: {
  def: any;
  isMandatory: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = (
    <Label className="flex items-center gap-1">
      {def.label_ru}
      {isMandatory && <span className="text-destructive">*</span>}
      {def.unit && <span className="text-xs text-muted-foreground">({def.unit})</span>}
    </Label>
  );

  const options: { value: string; label_ru: string }[] = Array.isArray(def.options) ? def.options : [];

  let control: React.ReactNode;
  switch (def.field_type) {
    case "textarea":
      control = <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      control = <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "date":
      control = <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "datetime":
      control = <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "boolean":
      control = (
        <div className="flex items-center gap-2">
          <Switch
            checked={value === "true"}
            onCheckedChange={(c) => onChange(c ? "true" : "false")}
          />
          <span className="text-sm text-muted-foreground">{value === "true" ? "Да" : "Нет"}</span>
        </div>
      );
      break;
    case "select":
      control = (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Выберите..." /></SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label_ru}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
      break;
    case "multiselect": {
      const selected = value ? value.split(",").filter(Boolean) : [];
      const toggle = (val: string) => {
        const next = selected.includes(val)
          ? selected.filter((v) => v !== val)
          : [...selected, val];
        onChange(next.join(","));
      };
      control = (
        <div className="space-y-1">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              {o.label_ru}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "calculated":
    case "auto":
      control = <Input readOnly className="bg-muted" value={value} />;
      break;
    case "text":
    default:
      control = <Input value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className="space-y-1.5">
      {label}
      {control}
    </div>
  );
}
