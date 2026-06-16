import { cn } from "@/lib/utils";

interface Props {
  status: "overdue" | "due_soon" | "ok" | "none";
  score?: number;
  pulse?: boolean;
}

export default function EWSStatusDot({ status, score, pulse = true }: Props) {
  if (status === "none") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (status === "ok") {
    if (!score || score === 0) {
      return <span className="text-muted-foreground">—</span>;
    }
    return (
      <span
        className={cn(
          "text-xs font-bold px-1.5 py-0.5 rounded",
          score <= 2
            ? "bg-yellow-100 text-yellow-700"
            : score <= 6
            ? "bg-orange-100 text-orange-700"
            : "bg-red-100 text-red-700",
        )}
      >
        {score}
      </span>
    );
  }

  if (status === "overdue") {
    return (
      <div className="flex items-center gap-1.5 justify-center">
        <span className={cn("inline-block w-2.5 h-2.5 rounded-full bg-red-500", pulse && "animate-ping")} />
        {!!score && score > 0 && (
          <span className="text-xs font-bold text-red-700">{score}</span>
        )}
      </div>
    );
  }

  // due_soon
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <span className={cn("inline-block w-2.5 h-2.5 rounded-full bg-yellow-400", pulse && "animate-pulse")} />
      {!!score && score > 0 && (
        <span className="text-xs font-bold text-yellow-700">{score}</span>
      )}
    </div>
  );
}
