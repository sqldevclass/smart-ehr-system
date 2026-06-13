import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const ROLE_LABELS: Record<string, string> = {
  physician: "Врач",
  inpatient_nurse: "Медсестра",
  head_nurse: "Старшая медсестра",
  pharmacy_staff: "Фармацевт",
  admin: "Администратор",
  outpatient_registrar: "Регистратор",
  inpatient_registrar: "Регистратор (стац.)",
  warehouse_staff: "Склад",
  cashier: "Кассир",
  hr_staff: "HR",
  lab_staff: "Лаборант",
};

const ROLE_ROUTES: Record<string, string> = {
  physician: "/physician",
  inpatient_nurse: "/nurse",
  head_nurse: "/nurse",
  pharmacy_staff: "/pharmacy",
  admin: "/admin",
  outpatient_registrar: "/registrar",
  inpatient_registrar: "/inpatient",
  warehouse_staff: "/warehouse",
  cashier: "/cashier",
  hr_staff: "/hr",
  lab_staff: "/lab",
};

interface Props {
  roles: string[];
}

export default function RoleSwitcher({ roles }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!roles || roles.length === 0) return null;

  const first = roles[0];
  const rest = roles.slice(1);
  const firstLabel = ROLE_LABELS[first] ?? first;
  const firstRoute = ROLE_ROUTES[first];

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {firstRoute ? (
        <button
          type="button"
          onClick={() => navigate(firstRoute)}
          className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          {firstLabel}
        </button>
      ) : (
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground opacity-60">
          {firstLabel}
        </span>
      )}

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
          aria-label="Other roles"
        >
          »
        </button>
      )}

      {open && rest.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1">
          {rest.map((role) => {
            const label = ROLE_LABELS[role] ?? role;
            const route = ROLE_ROUTES[role];
            return route ? (
              <button
                key={role}
                type="button"
                onClick={() => { navigate(route); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                {label}
              </button>
            ) : (
              <span key={role} className="block px-3 py-1.5 text-xs text-muted-foreground opacity-60">
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
