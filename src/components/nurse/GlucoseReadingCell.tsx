import { formatDateTime } from "@/lib/formatDateTime";
import { cn } from "@/lib/utils";

export interface GlucoseReading {
  id: string;
  value_mmol: string | number;
  recorded_at: string;
}

/** One blood glucose reading; above 7.8 is yellow, below 3.9 is pink. */
export default function GlucoseReadingCell({ reading }: { reading: GlucoseReading }) {
  const dt = new Date(reading.recorded_at);
  const value = parseFloat(String(reading.value_mmol));
  const isHigh = value > 7.8;
  const isLow = value < 3.9;
  return (
    <div className="shrink-0 text-left">
      <div className={cn(
        "text-sm font-semibold",
        isHigh ? "text-yellow-700"
        : isLow ? "text-pink-700"
        : "text-gray-800"
      )}>
        {value % 1 === 0 ? value : value.toFixed(1)}{" "}
        <span className="font-normal text-xs text-muted-foreground">
          ммоль/л
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {formatDateTime(dt)}
      </div>
    </div>
  );
}
