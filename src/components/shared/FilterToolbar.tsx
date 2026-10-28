import type { ReactNode } from "react";

interface Props {
  left: ReactNode;
  right?: ReactNode;
}

export function FilterToolbar({ left, right }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {left}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
