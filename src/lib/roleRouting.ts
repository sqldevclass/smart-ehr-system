export const roleRoutes: Record<string, string> = {
  admin: "/admin",
  physician: "/physician",
  outpatient_registrar: "/registrar",
  registrar: "/registrar",
  inpatient_registrar: "/inpatient",
  cashier: "/cashier",
  inpatient_nurse: "/nurse",
  head_nurse: "/nurse",
  nurse: "/nurse",
  pharmacist: "/pharmacy",
  pharmacy_staff: "/pharmacy",
  warehouse_staff: "/warehouse",
  inventory_manager: "/inventory",
  hr: "/hr",
  lab_physician: "/lab/results",
  blood_draw_nurse: "/lab/blood-draw",
  finance: "/finance",
};

// Highest-priority dashboard first
export const ROLE_PRIORITY = [
  "admin",
  "physician",
  "outpatient_registrar",
  "inpatient_registrar",
  "cashier",
  "inpatient_nurse",
  "registrar",
  "hr",
  "lab_physician",
  "blood_draw_nurse",
  "pharmacist",
  "pharmacy_staff",
  "warehouse_staff",
  "inventory_manager",
  "finance",
];

export function pickPrimaryRole(roles: string[], preferredRole?: string | null): string | null {
  if (preferredRole && roles.includes(preferredRole)) return preferredRole;
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles[0] ?? null;
}

export function routeForRoles(roles: string[], preferredRole?: string | null): string | null {
  const primary = pickPrimaryRole(roles, preferredRole);
  return primary ? roleRoutes[primary] ?? null : null;
}
