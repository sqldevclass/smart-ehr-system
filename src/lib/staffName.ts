export interface StaffNameSource {
  full_name?: string | null;
  person?: { first_name?: string | null; last_name?: string | null } | null;
}

// "Babajanov B." from structured persons names. Falls back to profiles.full_name
// for staff profiles not linked to a persons row. Never splits full_name strings.
export function formatStaffShortName(source?: StaffNameSource | null): string {
  if (!source) return "";
  const last = source.person?.last_name?.trim();
  const first = source.person?.first_name?.trim();
  if (last) return first ? `${last} ${first.charAt(0).toUpperCase()}.` : last;
  return source.full_name?.trim() ?? "";
}
