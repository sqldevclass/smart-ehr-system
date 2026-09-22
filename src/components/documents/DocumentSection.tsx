import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ICD10SearchField from "./ICD10SearchField";
import { cn } from "@/lib/utils";
import RichTextarea from "./RichTextarea";
import MarkdownText from "./MarkdownText";


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
  onFocusEditable?: (el: HTMLDivElement, onChange: (val: string) => void) => void;
}

// Nutritional screening scoring -- these 4 fields are hardcoded by
// id (not attribute_code) because renderField only sees the one
// field currently rendering plus the shared values map, not a
// lookup of sibling field definitions.
const NUTRI_BMI_ID = "d3000000-0000-0000-0000-000000000100";
const NUTRI_WEIGHT_LOSS_ID = "b1000000-0000-0000-0000-000000000050";
const NUTRI_INTAKE_ID = "b1000000-0000-0000-0000-000000000051";
const NUTRI_STRESS_ID = "b1000000-0000-0000-0000-000000000052";
const NUTRI_TOTAL_ID = "b1000000-0000-0000-0000-000000000053";
const NUTRI_INPUT_IDS = [NUTRI_BMI_ID, NUTRI_WEIGHT_LOSS_ID, NUTRI_INTAKE_ID, NUTRI_STRESS_ID];

function computeNutritionTotal(vals: Record<string, string>): number {
  const boolScore = (id: string) => (vals[id] === "true" ? 2 : 0);
  const stress = parseInt(vals[NUTRI_STRESS_ID] || "0", 10) || 0;
  return boolScore(NUTRI_BMI_ID) + boolScore(NUTRI_WEIGHT_LOSS_ID) + boolScore(NUTRI_INTAKE_ID) + stress;
}

function nutritionInterpretation(total: number): string {
  if (total >= 5) return "5 и выше баллов — нужна консультация диетолога";
  if (total >= 3) return "3-4 балла — контроль питания лечащим врачом";
  return "0-2 балла — никаких действий";
}

function renderField(
  def: FieldDef,
  values: Record<string, string>,
  setVal: (id: string, v: string) => void,
  onFocusEditable?: (el: HTMLDivElement, onChange: (val: string) => void) => void,
) {
  const value = values[def.id] ?? "";
  const options: { value: string; label_ru: string }[] = Array.isArray(def.options) ? def.options : [];
  // Wraps setVal for the 4 nutrition-screening inputs: recomputes
  // and persists the total the moment any of them changes, so the
  // stored score never lags behind what's on screen. A no-op for
  // every other field.
  const setValWithNutriTotal = (id: string, v: string) => {
    setVal(id, v);
    if (NUTRI_INPUT_IDS.includes(id)) {
      const nextValues = { ...values, [id]: v };
      setVal(NUTRI_TOTAL_ID, String(computeNutritionTotal(nextValues)));
    }
  };
  switch (def.field_type) {
    case "textarea":
      return (
        <RichTextarea
          minRows={3}
          value={value}
          onChange={(val) => setVal(def.id, val)}
          onFocusEditable={onFocusEditable}
        />
      );
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
            onCheckedChange={(c) => setValWithNutriTotal(def.id, c ? "true" : "false")}
          />
          <span className="text-sm text-muted-foreground">{value === "true" ? "Да" : "Нет"}</span>
        </div>
      );
    case "select":
      return (
        <Select value={value} onValueChange={(v) => setValWithNutriTotal(def.id, v)}>
          <SelectTrigger><SelectValue placeholder="Выберите..." /></SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label_ru}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "checkbox_note": {
      const sepIdx = value.indexOf("::");
      const isChecked = value.startsWith("1::") || value === "1";
      const note = sepIdx >= 0 ? value.slice(sepIdx + 2) : "";
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isChecked}
            onCheckedChange={(c) => setVal(def.id, `${c ? "1" : "0"}::${note}`)}
          />
          <Input
            value={note}
            onChange={(e) => setVal(def.id, `${isChecked ? "1" : "0"}::${e.target.value}`)}
            placeholder="Примечание..."
            className="flex-1"
          />
        </div>
      );
    }
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
    case "auto": {
      if (def.id === NUTRI_TOTAL_ID) {
        const total = computeNutritionTotal(values);
        return (
          <div className="space-y-1">
            <Input readOnly className="bg-muted font-semibold" value={String(total)} />
            <p className="text-xs text-muted-foreground">{nutritionInterpretation(total)}</p>
          </div>
        );
      }
      return <Input readOnly className="bg-muted" value={value} />;
    }
    case "text":
    default:
      return <Input value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
  }
}

export default function DocumentSection({ section, values, setVal, isReadOnly, onFocusEditable }: Props) {
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
            <div
              key={field.def.id}
              className={cn(
                "space-y-1.5",
                isReadOnly && !values[field.def.id] && "print-hide-empty"
              )}
            >

              <div className="text-sm font-medium flex items-center gap-1">
                {field.def.label_ru}
                {field.def.unit && (
                  <span className="text-xs text-muted-foreground">({field.def.unit})</span>
                )}
                {field.is_mandatory && !isReadOnly && (
                  <span className="text-destructive">*</span>
                )}
              </div>
              {isDiag ? (
                <ICD10SearchField
                  fieldId={field.def.id}
                  label={field.def.label_ru}
                  value={values[field.def.id] ?? ""}
                  onChange={(val) => setVal(field.def.id, val)}
                  isReadOnly={isReadOnly}
                />
              ) : isReadOnly ? (
                <div className="text-sm py-1.5">
                  {values[field.def.id] ? (
                    <MarkdownText value={values[field.def.id]} className="leading-relaxed" />
                  ) : (
                    <span className="italic text-sm text-muted-foreground">Не заполнено</span>
                  )}
                </div>
              ) : (
                renderField(field.def, values, setVal, onFocusEditable)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
