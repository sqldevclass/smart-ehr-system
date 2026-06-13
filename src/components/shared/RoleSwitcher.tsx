import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  outpatient_registrar: "Регистратор",
  call_center_registrar: "Регистратор КЦ",
  inpatient_registrar: "Регистратор (стац.)",
  cashier: "Кассир",
  physician: "Врач",
  functional_diagnostics_physician: "Врач ФД",
  lab_physician: "Врач лаборатории",
  blood_draw_nurse: "Медсестра забора",
  inpatient_nurse: "Медсестра",
  head_nurse: "Старшая медсестра",
  senior_manager: "Старший менеджер",
  hr: "HR",
  finance: "Финансист",
  pharmacist: "Провизор",
  warehouse_staff: "Склад",
  inventory_manager: "Инвентаризатор",
  radiology_technician: "Рентген-лаборант",
};

const ROLE_ROUTES: Record<string, string> = {
  admin: "/admin",
  outpatient_registrar: "/registrar",
  inpatient_registrar: "/inpatient",
  cashier: "/cashier",
  physician: "/physician",
  inpatient_nurse: "/nurse",
  head_nurse: "/nurse",
  hr: "/hr",
  pharmacist: "/pharmacy",
  warehouse_staff: "/warehouse",
};

interface Props {
  roles: string[];
}

export default function RoleSwitcher({ roles }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
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

  const activeRole = roles.find((role) => {
    const route = ROLE_ROUTES[role];
    return route && pathname.startsWith(route);
  }) ?? roles[0];

  const otherRoles = roles.filter((r) => r !== activeRole);
  const activeLabel = ROLE_LABELS[activeRole] ?? activeRole;
  const activeRoute = ROLE_ROUTES[activeRole];

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {activeRoute ? (
        <button
          type="button"
          onClick={() => navigate(activeRoute)}
          className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          {activeLabel}
        </button>
      ) : (
        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground opacity-60">
          {activeLabel}
        </span>
      )}

      {otherRoles.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          aria-label="Other roles"
        >
          +{otherRoles.length}
        </button>
      )}

      {open && otherRoles.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border bg-popover shadow-md py-1">
          {otherRoles.map((role) => {
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
              <span
                key={role}
                className="block px-3 py-1.5 text-xs text-muted-foreground opacity-60"
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
