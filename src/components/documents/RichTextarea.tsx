import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Bold, Italic, Underline } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (val: string) => void;
  rows?: number;
  className?: string;
}

function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder: string,
  onChange: (val: string) => void,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.slice(start, end) || placeholder;
  const newText =
    text.slice(0, start) + before + selected + after + text.slice(end);
  onChange(newText);
  requestAnimationFrame(() => {
    textarea.focus();
    const newStart = start + before.length;
    const newEnd = newStart + selected.length;
    textarea.setSelectionRange(newStart, newEnd);
  });
}

export default function RichTextarea({ value, onChange, rows = 3, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const format = (before: string, after: string, placeholder: string) => {
    if (!ref.current) return;
    wrapSelection(ref.current, before, after, placeholder, onChange);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 border border-input rounded-t-md bg-muted/30 px-1 py-0.5">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            format("**", "**", "жирный текст");
          }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Жирный (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            format("_", "_", "курсив");
          }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Курсив (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            format("__", "__", "подчёркнутый текст");
          }}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Подчёркнутый (Ctrl+U)"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>
      </div>
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("font-mono text-sm rounded-t-none", className)}
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey) {
            if (e.key === "b") { e.preventDefault(); format("**", "**", "жирный текст"); }
            if (e.key === "i") { e.preventDefault(); format("_", "_", "курсив"); }
            if (e.key === "u") { e.preventDefault(); format("__", "__", "подчёркнутый текст"); }
          }
        }}
      />
    </div>
  );
}
