import { Fragment } from "react";
import { getHighlightRanges } from "@/lib/search";

interface HighlightMatchProps {
  text?: string | null;
  term: string;
  // Other normalized forms of the same value (e.g. DOB yyyymmdd).
  alternates?: string[];
  fallback?: string;
}

// Renders text with the parts matching the patient search term in bold.
export default function HighlightMatch({ text, term, alternates, fallback = "" }: HighlightMatchProps) {
  if (!text) return <>{fallback}</>;
  const ranges = getHighlightRanges(text, term, alternates);
  if (ranges.length === 0) return <>{text}</>;

  const parts: JSX.Element[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, start)}</Fragment>);
    parts.push(
      <strong key={`m${i}`} className="font-bold text-foreground">
        {text.slice(start, end)}
      </strong>
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <>{parts}</>;
}

