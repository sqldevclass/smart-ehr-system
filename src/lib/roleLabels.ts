export interface PickableRole {
  id: string;
  code: string;
  name_en: string | null;
  name_ru: string | null;
  is_system: boolean | null;
  is_active: boolean | null;
}

export const isCustomRole = (code: string) => code.startsWith("custom_");

/** Custom roles show their Russian name; system roles keep the existing label. */
export function pickerRoleLabel(r: PickableRole): string {
  if (isCustomRole(r.code) && r.name_ru) return r.name_ru;
  return r.name_en || r.code.replace(/_/g, " ");
}

/** Active roles only; admin is hidden unless the current user is an admin. */
export function filterPickableRoles(roles: PickableRole[], currentUserIsAdmin: boolean): PickableRole[] {
  return roles.filter((r) => r.is_active && (r.code !== "admin" || currentUserIsAdmin));
}

export const PICKABLE_ROLE_FIELDS = "id, code, name_en, name_ru, is_system, is_active";
