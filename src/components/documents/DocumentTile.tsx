import { Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface DocumentTileData {
  id: string;
  status: string;
  created_at: string;
  document_types?: { id: string; name_ru: string; color: string | null } | null;
  author?: { full_name: string | null } | null;
}

interface DocumentTileProps {
  doc: DocumentTileData;
  isOp?: boolean;
  isActive?: boolean;
  // Disabled = visible but not openable (e.g. someone else's draft).
  disabled?: boolean;
  onSelect?: () => void;
}

// Single source of truth for how a document is listed anywhere in the
// physician document panel (current IP docs, current OP docs, History).
// Document TYPE is encoded by the right-hand box background color.
export default function DocumentTile({ doc, isOp = false, isActive = false, disabled = false, onSelect }: DocumentTileProps) {
  const isCompleted = doc.status === "completed";
  const typeColor = doc.document_types?.color || "#888888";

  return (
    <div
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        "flex items-stretch rounded-[5px] border border-blue-100 bg-blue-50 overflow-hidden text-xs transition-colors",
        disabled ? "cursor-default opacity-50" : "cursor-pointer hover:bg-blue-100",
        isActive && "bg-blue-100 ring-1 ring-blue-300"
      )}
    >
      <div className="flex-1 min-w-0 px-2 py-1.5">
        <div className="truncate font-medium text-foreground">
          {doc.document_types?.name_ru}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground min-w-0">
          {isOp && (
            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-100 text-blue-800 shrink-0">
              OP
            </span>
          )}
          <span className="shrink-0">
            {format(new Date(doc.created_at), "dd.MM.yyyy HH:mm")}
          </span>
          {doc.author?.full_name && (
            <span className="truncate">· {doc.author.full_name}</span>
          )}
        </div>
      </div>

      <div
        className="shrink-0 flex flex-col items-center justify-center gap-1 px-1.5 py-1.5"
        style={{ backgroundColor: typeColor }}
      >
        <span
          className={cn(
            "text-[10px] leading-none px-1.5 py-1 rounded",
            isCompleted ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
          )}
        >
          {isCompleted ? "✓" : "●"}
        </span>
        {!disabled && (
          <span
            role="button"
            title="Просмотреть документ целиком"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`/documents/${doc.id}/view`, "_blank");
            }}
            className="p-1 rounded-md bg-white/90 border border-border cursor-pointer transition-all hover:bg-white hover:shadow-md group"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
          </span>
        )}
      </div>
    </div>
  );
}
