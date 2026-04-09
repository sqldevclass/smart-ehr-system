interface Props { title: string; }

export default function AdminPlaceholder({ title }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
      <p>This section is coming soon.</p>
    </div>
  );
}
