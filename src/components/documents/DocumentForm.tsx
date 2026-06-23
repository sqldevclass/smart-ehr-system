import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
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

type ExistingDoc = {
  id: string;
  status: string;
  document_type_id: string | null;
} | null;

export default function DocumentForm(props: Props) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(props.documentTypeId);

  const { data: existingDoc, isLoading: existingDocLoading } = useQuery({
    queryKey: ["existing-document", props.visitServiceId, props.hospitalId],
    enabled: !!props.visitServiceId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select("id, status, document_type_id")
        .eq("visit_service_id", props.visitServiceId)
        .eq("hospital_id", props.hospitalId)
        .maybeSingle();
      return (data ?? null) as ExistingDoc;
    },
  });

  useEffect(() => {
    if (existingDoc && !selectedTypeId && existingDoc.document_type_id) {
      setSelectedTypeId(existingDoc.document_type_id);
    }
  }, [existingDoc, selectedTypeId]);

  const { data: docType } = useQuery({
    queryKey: ["document-type", selectedTypeId],
    enabled: !!selectedTypeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color, requires_second_sig")
        .eq("id", selectedTypeId!)
        .single();
      return data;
    },
  });

  const { data: sectionsData } = useQuery({
    queryKey: ["document-type-sections-only", selectedTypeId],
    enabled: !!selectedTypeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_type_sections")
        .select(`
          sort_order,
          document_sections!inner(id, code, name_ru)
        `)
        .eq("document_type_id", selectedTypeId!)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: fieldsData } = useQuery({
    queryKey: ["document-type-fields-only", selectedTypeId],
    enabled: !!selectedTypeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_type_fields")
        .select(`
          section_id,
          sort_order,
          is_mandatory,
          is_visible,
          field_definitions!inner(
            id, attribute_code, label_ru,
            field_type, options, unit
          )
        `)
        .eq("document_type_id", selectedTypeId!)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: existingValues } = useQuery({
    queryKey: ["document-field-values", existingDoc?.id],
    enabled: !!existingDoc?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_document_field_values")
        .select("field_definition_id, value")
        .eq("patient_document_id", existingDoc!.id);
      return data || [];
    },
  });

  const valuesReady = !existingDoc?.id || !!existingValues;
  const isReady =
    !!selectedTypeId &&
    !!sectionsData &&
    !!fieldsData &&
    valuesReady &&
    !existingDocLoading;

  const dirtyRef = useRef(false);
  const saveRef = useRef<(() => Promise<string | null>) | null>(null);

  return (
    <Sheet
      open={true}
      onOpenChange={async (o) => {
        if (!o) {
          if (dirtyRef.current && saveRef.current) {
            try { await saveRef.current(); } catch { /* silent */ }
          }
          props.onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {existingDocLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedTypeId ? (
          <TypePicker
            hospitalId={props.hospitalId}
            onSelect={(id) => setSelectedTypeId(id)}
          />
        ) : !isReady ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DocumentFormInner
            visitServiceId={props.visitServiceId}
            patientId={props.patientId}
            hospitalizationId={props.hospitalizationId}
            hospitalId={props.hospitalId}
            selectedTypeId={selectedTypeId}
            existingDoc={existingDoc ?? null}
            sectionsData={sectionsData || []}
            fieldsData={fieldsData || []}
            existingValues={existingValues || []}
            docType={docType}
            onClose={props.onClose}
            onSaved={props.onSaved}
            dirtyRef={dirtyRef}
            saveRef={saveRef}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

export { DocumentForm };

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

interface InnerProps {
  visitServiceId: string;
  patientId: string;
  hospitalizationId: string | null;
  hospitalId: string;
  selectedTypeId: string;
  existingDoc: { id: string; status: string } | null;
  sectionsData: any[];
  fieldsData: any[];
  existingValues: { field_definition_id: string; value: string }[];
  docType: any;
  onClose: () => void;
  onSaved: () => void;
  dirtyRef: React.MutableRefObject<boolean>;
  saveRef: React.MutableRefObject<((silent?: boolean) => Promise<string | null>) | null>;
}

function DocumentFormInner({
  visitServiceId, patientId, hospitalizationId, hospitalId,
  selectedTypeId, existingDoc, sectionsData, fieldsData, existingValues,
  docType, onSaved, dirtyRef, saveRef,
}: InnerProps) {
  const { user } = useAuth();

  const [documentId, setDocumentId] = useState<string | null>(() => existingDoc?.id ?? null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const loaded: Record<string, string> = {};
    (existingValues || []).forEach((v) => {
      loaded[v.field_definition_id] = v.value ?? "";
    });
    return loaded;
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const isReadOnly = existingDoc?.status === "completed";

  const sections = useMemo(() => {
    if (!sectionsData || !fieldsData) return [];
    return [...sectionsData]
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s: any) => ({
        id: s.document_sections.id,
        name_ru: s.document_sections.name_ru,
        fields: [...fieldsData]
          .filter((f: any) =>
            f.section_id === s.document_sections.id &&
            f.is_visible !== false
          )
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((f: any) => ({
            is_mandatory: f.is_mandatory,
            def: f.field_definitions,
          })),
      }))
      .filter((s) => s.fields.length > 0);
  }, [sectionsData, fieldsData]);

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

  const setVal = (id: string, v: string) => {
    dirtyRef.current = true;
    setIsDirty(true);
    setValues((p) => ({ ...p, [id]: v }));
  };

  const handleSave = async (silent = false): Promise<string | null> => {
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
            document_type_id: selectedTypeId,
            visit_service_id: visitServiceId,
            status: "preliminary",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) { if (!silent) toast.error(error.message); return null; }
        docId = doc!.id;
        setDocumentId(docId);
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
        if (upErr) { if (!silent) toast.error(upErr.message); return null; }
      }
      dirtyRef.current = false;
      if (!silent) toast.success("Сохранено");
      return docId;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    saveRef.current = handleSave;
    return () => { saveRef.current = null; };
  });

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const docId = await handleSave(true);
      if (!docId) return;
      const { error } = await supabase.rpc("complete_document", { p_document_id: docId });
      if (error) { toast.error(error.message); return; }
      toast.success("Документ подтверждён");
      onSaved();
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm = !isReadOnly && allMandatoryFilled && documentId !== null && !isSaving && !isConfirming;

  return (
    <>
      <SheetHeader>
        <SheetTitle style={{ color: docType?.color || undefined }} className="flex items-center gap-2">
          {docType?.name_ru || "Документ"}
          {isReadOnly && (
            <Badge className="bg-green-600 hover:bg-green-600 text-white">Завершено</Badge>
          )}
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
                    readOnly={isReadOnly}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      <SheetFooter className="mt-6 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {isReadOnly ? (
          <div className="flex w-full justify-end">
            <Button variant="outline" onClick={onSaved}>Закрыть</Button>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <Button onClick={handleConfirm} disabled={!canConfirm}>
              Подтвердить
            </Button>
          </div>
        )}
      </SheetFooter>
    </>
  );
}

function FieldRow({
  def, isMandatory, value, onChange, readOnly,
}: {
  def: any;
  isMandatory: boolean;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const label = (
    <Label className="flex items-center gap-1">
      {def.label_ru}
      {isMandatory && !readOnly && <span className="text-destructive">*</span>}
      {def.unit && <span className="text-xs text-muted-foreground">({def.unit})</span>}
    </Label>
  );

  const options: { value: string; label_ru: string }[] = Array.isArray(def.options) ? def.options : [];

  let control: React.ReactNode;

  if (readOnly) {
    let display = value;
    if (def.field_type === "boolean") {
      display = value === "true" ? "Да" : "Нет";
    } else if (def.field_type === "select") {
      display = options.find((o) => o.value === value)?.label_ru ?? value;
    } else if (def.field_type === "multiselect") {
      const sel = value ? value.split(",").filter(Boolean) : [];
      display = sel.map((v) => options.find((o) => o.value === v)?.label_ru ?? v).join(", ");
    }
    control = display ? (
      <p className="text-sm whitespace-pre-wrap py-1.5 text-foreground">{display}</p>
    ) : (
      <span className="italic text-sm text-muted-foreground">Не заполнено</span>
    );
  } else {
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
  }

  return (
    <div className="space-y-1.5">
      {label}
      {control}
    </div>
  );
}
