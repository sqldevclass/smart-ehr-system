import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  documentTypeId: string;
  hospitalId: string;
  physicianId: string | null;
  patientId: string;
  currentDocumentId: string | null;
  values: Record<string, string>;
  sections: any[];
  onApply: (values: Record<string, string>) => void;
  isReadOnly: boolean;
}

const EXCLUDED_PREFIXES = ["diag.", "vitals.", "tcrit."];
const isExcluded = (code: string) =>
  EXCLUDED_PREFIXES.some((p) => code.startsWith(p));

export default function TemplatePanel({
  documentTypeId,
  hospitalId,
  physicianId,
  patientId,
  currentDocumentId,
  values,
  sections,
  onApply,
  isReadOnly,
}: Props) {
  const [showNameInput, setShowNameInput] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExistingDocs, setShowExistingDocs] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const { data: templates = [], refetch } = useQuery({
    queryKey: ["doc-templates", documentTypeId, physicianId],
    enabled: !!documentTypeId && !!physicianId,
    queryFn: async () => {
      const { data } = await supabase
        .from("physician_document_templates" as any)
        .select("id, name, created_at")
        .eq("document_type_id", documentTypeId)
        .eq("physician_id", physicianId!)
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false });
      return (data as any) || [];
    },
  });

  const { data: existingDocs = [] } = useQuery({
    queryKey: ["patient-completed-docs", patientId],
    enabled: !!patientId && showExistingDocs,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select(`
          id, completed_at,
          document_types!inner(name_ru),
          patient_document_field_values(
            field_definition_id,
            value,
            field_definitions!inner(attribute_code)
          )
        `)
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .eq("status", "completed")
        .neq("id", currentDocumentId ?? "")
        .order("completed_at", { ascending: false });
      return data || [];
    },
  });

  const handleSave = async () => {
    if (!physicianId) return;
    setSaving(true);
    try {
      const { data: tmpl, error: tErr } = await supabase
        .from("physician_document_templates" as any)
        .insert({
          physician_id: physicianId,
          hospital_id: hospitalId,
          document_type_id: documentTypeId,
          name: templateName.trim(),
        })
        .select("id")
        .single();
      if (tErr || !tmpl) {
        toast.error(tErr?.message || "Ошибка");
        return;
      }

      const fieldValues: any[] = [];
      sections.forEach((section: any) => {
        section.fields.forEach((f: any) => {
          const code = f.def.attribute_code ?? "";
          const val = values[f.def.id];
          if (!isExcluded(code) && val?.trim()) {
            fieldValues.push({
              template_id: (tmpl as any).id,
              field_definition_id: f.def.id,
              value: val,
            });
          }
        });
      });

      if (fieldValues.length > 0) {
        await supabase
          .from("physician_document_template_values" as any)
          .insert(fieldValues);
      }

      setShowNameInput(false);
      setTemplateName("");
      refetch();
      toast.success("Шаблон сохранён");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async (templateId: string) => {
    const { data: vals } = await supabase
      .from("physician_document_template_values" as any)
      .select("field_definition_id, value")
      .eq("template_id", templateId);

    const allFieldIds: Record<string, string> = {};
    sections.forEach((section: any) => {
      section.fields.forEach((f: any) => {
        const code = f.def.attribute_code ?? "";
        if (!isExcluded(code)) {
          allFieldIds[f.def.id] = "";
        }
      });
    });
    ((vals as any) || []).forEach((v: any) => {
      allFieldIds[v.field_definition_id] = v.value;
    });
    onApply(allFieldIds);
    toast.success("Шаблон применён");
  };

  const handleDelete = async (templateId: string) => {
    await supabase
      .from("physician_document_templates" as any)
      .delete()
      .eq("id", templateId);
    refetch();
  };

  const handleApplyExisting = (sourceDoc: any) => {
    const sourceByCode: Record<string, string> = {};
    (sourceDoc.patient_document_field_values || [])
      .forEach((v: any) => {
        const code = v.field_definitions?.attribute_code;
        if (code && v.value?.trim()) {
          sourceByCode[code] = v.value;
        }
      });

    const newValues: Record<string, string> = {};
    sections.forEach((section: any) => {
      section.fields.forEach((f: any) => {
        const code = f.def.attribute_code ?? "";
        if (isExcluded(code)) return;
        newValues[f.def.id] = sourceByCode[code] ?? "";
      });
    });
    onApply(newValues);
    setShowExistingDocs(false);
  };

  if (!physicianId) return null;

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-muted-foreground">Шаблоны</div>

      {templates.map((t: any) => (
        <div
          key={t.id}
          className="flex items-center justify-between group p-2 rounded-md border bg-card hover:bg-muted cursor-pointer text-sm"
          onClick={() => handleApply(t.id)}
        >
          <span className="truncate">{t.name}</span>
          {!isReadOnly && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(t.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive ml-2 shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {!isReadOnly && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8 mb-2"
            onClick={() => setShowExistingDocs(true)}
          >
            Использовать существующий документ
          </Button>
          <div className="pt-2 border-t">
            {showNameInput ? (
              <div className="space-y-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Название шаблона"
                  className="text-sm h-8"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1"
                    disabled={!templateName.trim() || saving}
                    onClick={handleSave}
                  >
                    {saving ? "..." : "Сохранить"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setShowNameInput(false);
                      setTemplateName("");
                    }}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-8"
                onClick={() => setShowNameInput(true)}
              >
                + Сохранить как шаблон
              </Button>
            )}
          </div>
        </>
      )}

      <Dialog open={showExistingDocs} onOpenChange={setShowExistingDocs}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Выбрать существующий документ</DialogTitle>
            <DialogDescription>
              Поля будут заполнены из выбранного документа. Диагноз и показатели не переносятся.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {existingDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Нет завершённых документов
              </p>
            ) : (
              existingDocs.map((doc: any) => (
                <button
                  key={doc.id}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted transition-colors"
                  onClick={() => handleApplyExisting(doc)}
                >
                  <div className="font-medium text-sm">
                    {doc.document_types?.name_ru}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {doc.completed_at
                      ? format(
                          new Date(doc.completed_at),
                          "dd.MM.yyyy HH:mm"
                        )
                      : "—"}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
