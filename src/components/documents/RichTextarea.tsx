import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  minRows?: number;
  onFocusEditable?: (el: HTMLDivElement, onChange: (val: string) => void) => void;
}

export default function RichTextarea({
  value,
  onChange,
  className,
  minRows = 3,
  onFocusEditable,
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

  const handleInput = () => {
    if (!ref.current) return;
    isInternalChange.current = true;
    const text = ref.current.innerText?.trim() ?? "";
    const html = ref.current.innerHTML;
    onChange(text === "" ? "" : html);
  };

  const handleFocus = () => {
    if (ref.current) onFocusEditable?.(ref.current, onChange);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b" || e.key === "i" || e.key === "u") {
        e.preventDefault();
        document.execCommand(
          e.key === "b" ? "bold" : e.key === "i" ? "italic" : "underline",
          false
        );
        handleInput();
      }
    }
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "whitespace-pre-wrap break-words",
        className
      )}
      style={{ minHeight: `${minRows * 1.5}rem` }}
    />
  );
}
