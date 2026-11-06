import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TurnoverKind } from "./turnoverTypes";

interface KindToggleProps {
  value: TurnoverKind;
  onChange: (kind: TurnoverKind) => void;
  counts?: Partial<Record<TurnoverKind, number>>;
}

export function KindToggle({ value, onChange, counts }: KindToggleProps) {
  const label = (kind: TurnoverKind, text: string) =>
    counts ? `${text} (${counts[kind] ?? 0})` : text;

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) onChange(nextValue as TurnoverKind);
      }}
    >
      <ToggleGroupItem value="drug">{label("drug", "Препараты")}</ToggleGroupItem>
      <ToggleGroupItem value="product">{label("product", "Товары")}</ToggleGroupItem>
    </ToggleGroup>
  );
}
