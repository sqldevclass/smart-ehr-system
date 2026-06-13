interface Props {
  value: string;
  className?: string;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
    .replace(/__(.+?)__/gs, "<u>$1</u>")
    .replace(/_(.+?)_/gs, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

export default function MarkdownText({ value, className }: Props) {
  if (!value) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
    />
  );
}
