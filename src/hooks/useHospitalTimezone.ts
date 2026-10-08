import { useAuth } from "@/hooks/useAuth";

const DEFAULT_TIMEZONE = "Asia/Tashkent";

/** The hospital's IANA timezone (all of a hospital's users share it); Tashkent if none is set. */
export function useHospitalTimezone(): string {
  const { user } = useAuth();
  return user?.timezone || DEFAULT_TIMEZONE;
}
