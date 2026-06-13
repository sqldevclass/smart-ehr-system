interface Props {
  value: string;
  className?: string;
}

export default function MarkdownText({ value, className }: Props) {
  if (!value) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  );
}
