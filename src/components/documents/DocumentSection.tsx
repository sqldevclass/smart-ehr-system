import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import ICD10SearchField from "./ICD10SearchField";
import { cn } from "@/lib/utils";
import RichTextarea from "./RichTextarea";
import MarkdownText from "./MarkdownText";
import YesNoRadio from "./YesNoRadio";


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

// "Физикальные показатели" (vitals) fields -- these now live at the top of
// objective_assessment_full (moved there by migration), identified by
// attribute_code since they're shared across many document types.
// bmi_nursing is the nursing-exam-specific BMI field for the same group.
const VITALS_ATTRIBUTE_CODES = [
  "vitals.bp", "vitals.pulse", "vitals.heart_rate", "vitals.rr", "vitals.spo2",
  "vitals.temperature", "vitals.height", "vitals.weight", "vitals.bmi", "bmi_nursing",
];

// "При госпитализации проверено" admission-check fields -- rendered as a
// horizontal row of plain checkboxes (checked = yes, unchecked = no)
// under their own group heading, instead of the usual Да/Нет radio pair
// every other boolean field uses.
const ADMISSION_CHECK_ATTRIBUTE_CODES = [
  "tx.admission_rw", "tx.admission_hiv", "tx.admission_stool_culture",
  "tx.admission_pediculosis", "tx.admission_covid",
];

// Field types that render as a short value (a number, or a read-only
// auto/calculated stamp) and don't need a full-width row. Grouped into
// compact, flex-wrap rows instead. NUTRI_TOTAL_ID is excluded even
// though it's "calculated" -- it renders an extra interpretation line
// below its value and needs the full width.
const COMPACT_FIELD_TYPES = ["number", "auto", "calculated"];

function isCompactField(field: SectionField) {
  if (ADMISSION_CHECK_ATTRIBUTE_CODES.includes(field.def.attribute_code ?? "")) return true;
  return COMPACT_FIELD_TYPES.includes(field.def.field_type) && field.def.id !== NUTRI_TOTAL_ID;
}

// Partitions a section's fields into either single full-width fields
// or runs of consecutive compact fields (rendered together in one row).
function groupFields(fields: SectionField[]): (SectionField | SectionField[])[] {
  const groups: (SectionField | SectionField[])[] = [];
  let run: SectionField[] = [];
  for (const f of fields) {
    if (isCompactField(f)) {
      run.push(f);
    } else {
      if (run.length) {
        groups.push(run);
        run = [];
      }
      groups.push(f);
    }
  }
  if (run.length) groups.push(run);
  return groups;
}

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

// Plain-text display for "auto"/"calculated" fields -- these are
// system-computed and never directly editable, so they never render
// as an input box in any state (editing or completed/read-only).
// Larger/bolder than ordinary field text since these are short,
// often important values (a score, a date, a day-count).
function CalculatedValue({ def, values }: { def: FieldDef; values: Record<string, string> }) {
  const value = values[def.id] ?? "";
  if (def.id === NUTRI_TOTAL_ID) {
    const total = computeNutritionTotal(values);
    return (
      <div className="space-y-1">
        <div className="text-2xl font-semibold">{total}</div>
        <p className="text-xs text-muted-foreground">{nutritionInterpretation(total)}</p>
      </div>
    );
  }
  return (
    <div className="text-lg font-semibold">
      {value || <span className="italic text-sm font-normal text-muted-foreground">Не заполнено</span>}
    </div>
  );
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
        <YesNoRadio
          value={value}
          onValueChange={(v) => setValWithNutriTotal(def.id, v)}
          idPrefix={def.id}
        />
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
    case "radio_select":
      return (
        <RadioGroup
          value={value || undefined}
          onValueChange={(v) => setValWithNutriTotal(def.id, v)}
          className="flex flex-wrap gap-4"
        >
          {options.map((o) => (
            <div key={o.value} className="flex items-center gap-1.5">
              <RadioGroupItem value={o.value} id={`${def.id}-${o.value}`} />
              <Label htmlFor={`${def.id}-${o.value}`} className="text-sm font-normal cursor-pointer">
                {o.label_ru}
              </Label>
            </div>
          ))}
        </RadioGroup>
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
      // "Цели госпитализации" lays its options out horizontally to avoid
      // dead space; every other multiselect field keeps the original
      // vertical list.
      const isHorizontal = def.attribute_code === "tx.goals";
      return (
        <div className={isHorizontal ? "flex flex-wrap gap-x-4 gap-y-2" : "space-y-1"}>
          {options.map((o) => (
            <label key={o.value} className={cn("flex items-center gap-2 text-sm", isHorizontal && "shrink-0")}>
              <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              {o.label_ru}
            </label>
          ))}
        </div>
      );
    }
    case "text":
    default:
      return <Input value={value} onChange={(e) => setVal(def.id, e.target.value)} />;
  }
}

function FieldLabel({ field, isReadOnly }: { field: SectionField; isReadOnly: boolean }) {
  return (
    <div className="text-sm font-medium flex items-center gap-1">
      {field.def.label_ru}
      {field.def.unit && (
        <span className="text-xs text-muted-foreground">({field.def.unit})</span>
      )}
      {field.is_mandatory && !isReadOnly && (
        <span className="text-destructive">*</span>
      )}
    </div>
  );
}

function FieldValue({
  field,
  values,
  setVal,
  isReadOnly,
  onFocusEditable,
}: {
  field: SectionField;
  values: Record<string, string>;
  setVal: (id: string, val: string) => void;
  isReadOnly: boolean;
  onFocusEditable?: (el: HTMLDivElement, onChange: (val: string) => void) => void;
}) {
  const isDiag =
    field.def.attribute_code?.startsWith("diag.") &&
    field.def.field_type === "textarea";
  if (isDiag) {
    return (
      <ICD10SearchField
        fieldId={field.def.id}
        label={field.def.label_ru}
        value={values[field.def.id] ?? ""}
        onChange={(val) => setVal(field.def.id, val)}
        isReadOnly={isReadOnly}
      />
    );
  }
  // auto/calculated fields are never user-editable, regardless of the
  // document's own edit state -- always plain text, never an input box.
  if (field.def.field_type === "auto" || field.def.field_type === "calculated") {
    return <CalculatedValue def={field.def} values={values} />;
  }
  if (isReadOnly) {
    const raw = values[field.def.id];
    if (field.def.field_type === "boolean") {
      return (
        <div className="text-sm py-1.5">
          {raw === "true" || raw === "false" ? (
            <span className="font-medium">{raw === "true" ? "Да" : "Нет"}</span>
          ) : (
            <span className="italic text-sm text-muted-foreground">Не заполнено</span>
          )}
        </div>
      );
    }
    if (field.def.field_type === "radio_select") {
      const opts: { value: string; label_ru: string }[] = Array.isArray(field.def.options) ? field.def.options : [];
      const selected = opts.find((o) => o.value === raw);
      return (
        <div className="text-sm py-1.5">
          {selected ? (
            <span className="font-medium">{selected.label_ru}</span>
          ) : (
            <span className="italic text-sm text-muted-foreground">Не заполнено</span>
          )}
        </div>
      );
    }
    return (
      <div className="text-sm py-1.5">
        {raw ? (
          <MarkdownText value={raw} className="leading-relaxed" />
        ) : (
          <span className="italic text-sm text-muted-foreground">Не заполнено</span>
        )}
      </div>
    );
  }
  return <>{renderField(field.def, values, setVal, onFocusEditable)}</>;
}

// Checkbox item for the admission-check group (checked = yes, unchecked =
// no) -- same "true"/"false" stored value as the "boolean" field_type
// convention elsewhere, just a different widget for this one group.
function AdmissionCheckItem({
  field,
  values,
  setVal,
  isReadOnly,
}: {
  field: SectionField;
  values: Record<string, string>;
  setVal: (id: string, val: string) => void;
  isReadOnly: boolean;
}) {
  const checked = values[field.def.id] === "true";
  return (
    <label className="flex items-center gap-2 text-sm shrink-0">
      <Checkbox
        checked={checked}
        disabled={isReadOnly}
        onCheckedChange={(c) => setVal(field.def.id, c ? "true" : "false")}
      />
      {field.def.label_ru}
    </label>
  );
}

// Renders one field's label + value block. `compact` narrows the
// wrapper so several of these can sit side by side in a flex-wrap row.
function renderFieldBlock(
  field: SectionField,
  values: Record<string, string>,
  setVal: (id: string, val: string) => void,
  isReadOnly: boolean,
  onFocusEditable: ((el: HTMLDivElement, onChange: (val: string) => void) => void) | undefined,
  compact: boolean,
) {
  return (
    <div
      key={field.def.id}
      className={cn(
        "space-y-1.5",
        compact ? "w-36 shrink-0" : "w-full",
        isReadOnly && !values[field.def.id] && "print-hide-empty"
      )}
    >
      <FieldLabel field={field} isReadOnly={isReadOnly} />
      <FieldValue
        field={field}
        values={values}
        setVal={setVal}
        isReadOnly={isReadOnly}
        onFocusEditable={onFocusEditable}
      />
    </div>
  );
}

export default function DocumentSection({ section, values, setVal, isReadOnly, onFocusEditable }: Props) {
  const groups = groupFields(section.fields);
  const hasVitalsGroup = section.fields.some((f) =>
    VITALS_ATTRIBUTE_CODES.includes(f.def.attribute_code ?? "")
  );
  return (
    <div className="document-section-page space-y-4">
      <h2 className="font-heading text-lg font-semibold border-b pb-2">
        {section.name_ru}
      </h2>
      <div className="space-y-4">
        {hasVitalsGroup && (
          <h3 className="font-heading text-base font-semibold">Физикальные показатели</h3>
        )}
        {groups.map((g, i) => {
          if (!Array.isArray(g)) {
            return renderFieldBlock(g, values, setVal, isReadOnly, onFocusEditable, false);
          }
          const isAdmissionCheckGroup = g.every((f) =>
            ADMISSION_CHECK_ATTRIBUTE_CODES.includes(f.def.attribute_code ?? "")
          );
          if (isAdmissionCheckGroup) {
            return (
              <div key={`row-${i}`} className="space-y-2">
                <h3 className="font-heading text-base font-semibold">При госпитализации проверено:</h3>
                <div className="flex flex-wrap gap-4">
                  {g.map((field) => (
                    <AdmissionCheckItem
                      key={field.def.id}
                      field={field}
                      values={values}
                      setVal={setVal}
                      isReadOnly={isReadOnly}
                    />
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={`row-${i}`} className="flex flex-wrap gap-4">
              {g.map((field) =>
                renderFieldBlock(field, values, setVal, isReadOnly, onFocusEditable, true)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
