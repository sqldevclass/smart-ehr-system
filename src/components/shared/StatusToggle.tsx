import { cn } from "@/lib/utils";

interface StatusToggleProps {
  value: "active" | "discharged";
  onChange: (v: "active" | "discharged") => void;
}

export default function StatusToggle({ value, onChange }: StatusToggleProps) {
  return (
    <div className="flex rounded-md border overflow-hidden shrink-0 w-fit">
      <button
        onClick={() => onChange("active")}
        className={cn(
          "px-3 py-1.5 text-xs font-medium transition-colors",
          value === "active"
            ? "bg-primary text-white"
            : "bg-white text-muted-foreground hover:bg-muted"
        )}
      >
        Активные
      </button>
      <button
        onClick={() => onChange("discharged")}
        className={cn(
          "px-3 py-1.5 text-xs font-medium border-l transition-colors",
          value === "discharged"
            ? "bg-primary text-white"
            : "bg-white text-muted-foreground hover:bg-muted"
        )}
      >
        Выписанные
      </button>
    </div>
  );
}
