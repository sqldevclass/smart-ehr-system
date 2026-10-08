import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface Props {
  value: string | undefined;
  onValueChange: (v: string) => void;
  idPrefix: string;
}

// Shared Да/Нет radio pair for any boolean-style question -- used by
// DocumentSection's generic "boolean" field type and by CSSRSSection.
export default function YesNoRadio({ value, onValueChange, idPrefix }: Props) {
  return (
    <RadioGroup
      value={value === "true" ? "true" : value === "false" ? "false" : undefined}
      onValueChange={onValueChange}
      className="flex items-center gap-4"
    >
      <div className="flex items-center gap-1.5">
        <RadioGroupItem value="true" id={`${idPrefix}-yes`} />
        <Label htmlFor={`${idPrefix}-yes`} className="text-sm font-normal cursor-pointer">Да</Label>
      </div>
      <div className="flex items-center gap-1.5">
        <RadioGroupItem value="false" id={`${idPrefix}-no`} />
        <Label htmlFor={`${idPrefix}-no`} className="text-sm font-normal cursor-pointer">Нет</Label>
      </div>
    </RadioGroup>
  );
}
