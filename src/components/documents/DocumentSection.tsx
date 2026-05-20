import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FieldDef {
  id: string;
  attribute_code?: string;
  label_ru: string;
  field_type: string;
  options: any;
  unit: string | null;
}

interface SectionField {
  is_mandatory: boolean;
  def: FieldDef;
}

interface Props {
  section: { id: string; name_ru: string; fields: SectionField[] };
  values: Record<string, string>;
  setVal: (id: string, val: string) => void;
  isReadOnly: boolean;
}

function renderField(
  def: FieldDef,
  values: Record<string, string>,
  setVal: (id: string, v: string) => void,
) {
  const value = values[def.id] ?? "";
  const options: { value: string; label_ru: string }[] = Array.isArray(def.options) ? def.options : [];
  switch (def.field_type) {
    case "textarea":
      return <Textarea rows={3} value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
    case "number":
      return <Input type="number" value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
    case "date":
      return <Input type="date" value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
    case "datetime":
      return <Input type="datetime-local" value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={value === "true"}
            onCheckedChange={(c) => setVal(def.id, c ? "true" : "false")}
          />
          <span className="text-sm text-muted-foreground">{value === "true" ? "Да" : "Нет"}</span>
        </div>
      );
    case "select":
      return (
        <Select value={value} onValueChange={(v) => setVal(def.id, v)}>
          <SelectTrigger><SelectValue placeholder="Выберите..." /></SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label_ru}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect": {
      const selected = value ? value.split(",").filter(Boolean) : [];
      const toggle = (v: string) => {
        const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
        setVal(def.id, next.join(","));
      };
      return (
        <div className="space-y-1">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              {o.label_ru}
            </label>
          ))}
        </div>
      );
    }
    case "calculated":
    case "auto":
      return <Input readOnly className="bg-muted" value={value} />;
    case "text":
    default:
      return <Input value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
  }
}

export default function DocumentSection({ section, values, setVal, isReadOnly }: Props) {
  const [icdSearch, setIcdSearch] = useState<Record<string, string>>({});

  const { data: icdResults = [] } = useQuery({
    queryKey: ["icd10-search", icdSearch],
    queryFn: async () => {
      const term = Object.values(icdSearch).find((v) => v && v.length >= 1);
      if (!term) return [];
      const { data } = await supabase
        .from("icd10_codes")
        .select("id, code, name_ru")
        .eq("is_leaf", true)
        .or(`name_ru.ilike.%${term}%,code.ilike.%${term}%`)
        .limit(20);
      return data || [];
    },
    enabled: Object.values(icdSearch).some((v) => v && v.length >= 1),
  });

  return (
    <div className="document-section-page space-y-4">
      <h2 className="font-heading text-lg font-semibold border-b pb-2">
        {section.name_ru}
      </h2>
      <div className="space-y-4">
        {section.fields.map((field) => {
          const isDiag =
            field.def.attribute_code?.startsWith("diag.") &&
            field.def.field_type === "textarea";
          return (
            <div key={field.def.id} className="space-y-1.5">
              <div className="text-sm font-medium flex items-center gap-1">
                {field.def.label_ru}
                {field.def.unit && (
                  <span className="text-xs text-muted-foreground">({field.def.unit})</span>
                )}
                {field.is_mandatory && !isReadOnly && (
                  <span className="text-destructive">*</span>
                )}
              </div>
              {isReadOnly ? (
                <div className="text-sm py-1.5 whitespace-pre-wrap">
                  {values[field.def.id] || (
                    <span className="italic text-sm text-muted-foreground">Не заполнено</span>
                  )}
                </div>
              ) : isDiag ? (
                <div className="relative">
                  <Input
                    value={icdSearch[field.def.id] ?? values[field.def.id] ?? ""}
                    onChange={(e) =>
                      setIcdSearch((p) => ({ ...p, [field.def.id]: e.target.value }))
                    }
                    placeholder="Поиск по МКБ-10..."
                  />
                  {icdResults.length > 0 && (icdSearch[field.def.id]?.length ?? 0) >= 1 && (
                    <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                      {icdResults.map((r: any) => (
                        <div
                          key={r.id}
                          className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                          onClick={() => {
                            const displayValue = `${r.code} — ${r.name_ru}`;
                            setVal(field.def.id, displayValue);
                            setIcdSearch((p) => ({ ...p, [field.def.id]: displayValue }));
                          }}
                        >
                          <span className="font-medium">{r.code}</span>
                          {" — "}
                          {r.name_ru}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                renderField(field.def, values, setVal)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
