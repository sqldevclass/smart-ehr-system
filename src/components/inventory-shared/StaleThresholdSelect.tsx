import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function staleToForm(days: number | null | undefined): string {
  return days == null ? "none" : String(days);
}

export function staleFromForm(v: string): number | null {
  return v === "none" ? null : Number(v);
}

export function staleLabel(days: number | null | undefined): string {
  if (days == null) return "—";
  const n = Number(days);
  if (n === 180) return "6 месяцев";
  if (n === 365) return "1 год";
  return `${n} дн.`;
}

interface Props { value: string; onChange: (v: string) => void; id?: string }

export function StaleThresholdSelect({ value, onChange, id }: Props) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Считать неликвидом, если нет движения</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Не отслеживать</SelectItem>
          <SelectItem value="180">6 месяцев</SelectItem>
          <SelectItem value="365">1 год</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Товар без расхода и перемещений дольше этого срока попадёт во вкладку «Неликвид».
      </p>
    </div>
  );
}
