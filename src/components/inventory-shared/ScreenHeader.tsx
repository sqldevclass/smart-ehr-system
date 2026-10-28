import type { ReactNode } from "react";

interface Props { title: string; subtitle?: string; right?: ReactNode }

export function ScreenHeader({ title, subtitle, right }: Props) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </div>;
}
