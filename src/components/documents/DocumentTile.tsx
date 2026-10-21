import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatStaffShortName, type StaffNameSource } from "@/lib/staffName";
import { useDocumentViewer } from "@/components/documents/DocumentViewerProvider";

// Shared select fragment for every query that feeds DocumentTile.
// Callers append their own extra columns/embeds after it.
export const DOCUMENT_TILE_FIELDS = `
  id, status, created_at, created_by,
  document_types!inner(id, name_ru, color),
  author:profiles!patient_documents_created_by_fkey(
    full_name,
    person:persons!profiles_person_id_fkey(first_name, last_name)
  )
`;

export interface DocumentTileData {
  id: string;
  status: string;
  created_at: string;
  document_types?: { id: string; name_ru: string; color: string | null } | null;
  author?: StaffNameSource | null;
}

interface DocumentTileProps {
  doc: DocumentTileData;
  isOp?: boolean;
  isActive?: boolean;
  // Disabled = visible but not openable (e.g. someone else's draft).
  disabled?: boolean;
  onSelect?: () => void;
}

// Single source of truth for how a document is listed anywhere (physician panel,
// nurse panel, History). Document TYPE is encoded by the right-hand box color;
// clicking that box opens the read-only pop-up viewer.
export default function DocumentTile({ doc, isOp = false, isActive = false, disabled = false, onSelect }: DocumentTileProps) {
  const { openDocument } = useDocumentViewer();
  const isCompleted = doc.status === "completed";
  const typeColor = doc.document_types?.color || "hsl(var(--document-type-fallback))";
  const authorName = formatStaffShortName(doc.author);

  return (
    <div
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!disabled && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        "flex items-stretch rounded-[5px] border border-[hsl(var(--document-border))] bg-[hsl(var(--document-background))] overflow-hidden text-xs transition-colors",
        disabled ? "cursor-default opacity-50" : "cursor-pointer hover:bg-[hsl(var(--document-selected))]",
        isActive && "bg-[hsl(var(--document-selected))] ring-1 ring-[hsl(var(--document-ring))]"
      )}
    >
      <div className="flex-1 min-w-0 px-2 py-1.5">
        <div className="truncate font-medium text-foreground">
          {doc.document_types?.name_ru}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground min-w-0">
          {isOp && (
            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[hsl(var(--document-selected))] text-[hsl(var(--document-op-foreground))] shrink-0">
              OP
            </span>
          )}
          <span className="shrink-0">
            {format(new Date(doc.created_at), "dd.MM.yyyy HH:mm")}
          </span>
          {authorName && <span className="truncate">· {authorName}</span>}
        </div>
      </div>

      <Button
        variant="ghost"
        type="button"
        disabled={disabled}
        title="Просмотреть документ целиком"
        aria-label="Просмотреть документ целиком"
        onClick={(e) => {
          e.stopPropagation();
          openDocument(doc.id);
        }}
        className={cn(
          "group h-auto rounded-none border-0 whitespace-normal shrink-0 flex flex-col items-center justify-center gap-1 px-1.5 py-1.5 transition-[filter]",
          disabled ? "cursor-default" : "cursor-pointer hover:brightness-95"
        )}
        style={{ backgroundColor: typeColor }}
      >
        <span
          className={cn(
            "text-[10px] leading-none px-1.5 py-1 rounded",
            isCompleted ? "bg-[hsl(var(--document-completed-background))] text-[hsl(var(--document-completed-foreground))]" : "bg-[hsl(var(--document-draft-background))] text-[hsl(var(--document-draft-foreground))]"
          )}
        >
          {isCompleted ? "✓" : "●"}
        </span>
        {!disabled && (
          <span className="p-1 rounded-md bg-card/90 border border-border transition-all group-hover:bg-card group-hover:shadow-md">
            <Eye className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
          </span>
        )}
      </Button>
    </div>
  );
}
