import { useRef, useEffect } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  minRows?: number;
}

export default function RichTextarea({
  value,
  onChange,
  className,
  minRows = 3,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const execFormat = (command: string) => {
    ref.current?.focus();
    document.execCommand(command, false);
    if (ref.current) {
      isInternalChange.current = true;
      onChange(ref.current.innerHTML);
    }
  };

  const handleInput = () => {
    if (!ref.current) return;
    isInternalChange.current = true;
    // Normalize: if text content is empty, emit ""
    // so allMandatoryFilled correctly sees an empty field
    const text = ref.current.innerText?.trim() ?? "";
    const html = ref.current.innerHTML;
    onChange(text === "" ? "" : html);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); execFormat("bold"); }
      if (e.key === "i") { e.preventDefault(); execFormat("italic"); }
      if (e.key === "u") { e.preventDefault(); execFormat("underline"); }
    }
  };

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-1 border border-input border-b-0 rounded-t-md bg-muted/30 px-1 py-0.5">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execFormat("bold"); }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Жирный (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execFormat("italic"); }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Курсив (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); execFormat("underline"); }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Подчёркнутый (Ctrl+U)"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full rounded-b-md border border-input bg-background px-3 py-2 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "whitespace-pre-wrap break-words",
          className
        )}
        style={{ minHeight: `${minRows * 1.5}rem` }}
      />
    </div>
  );
}
