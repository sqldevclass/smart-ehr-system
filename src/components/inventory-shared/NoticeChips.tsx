import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NOTICE_OPTIONS } from "@/lib/equipmentDates";

export function NoticeChips({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Предупреждать за:</span>
      <ToggleGroup type="single" size="sm" variant="outline" value={String(value)} onValueChange={(v) => { if (v) onChange(Number(v)); }}>
        {NOTICE_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.days} value={String(o.days)} className="h-7 px-2 text-xs">{o.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
