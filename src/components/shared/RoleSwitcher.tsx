import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface RoleDetail {
  code: string;
  name_ru: string;
  dashboard_route: string | null;
}

interface Props {
  roles: RoleDetail[];
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

  const activeRole =
    roles.find(
      (role) => role.dashboard_route && pathname.startsWith(role.dashboard_route),
    ) ?? roles[0];

  const otherRoles = roles.filter((r) => r.code !== activeRole.code);
  const activeLabel = activeRole.name_ru ?? activeRole.code;
  const activeRoute = activeRole.dashboard_route;

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
            const label = role.name_ru ?? role.code;
            const route = role.dashboard_route;
            return route ? (
              <button
                key={role.code}
                type="button"
                onClick={() => { navigate(route); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                {label}
              </button>
            ) : (
              <span
                key={role.code}
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
