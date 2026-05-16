import { useAuthContext } from "@/contexts/AuthContext";

export type { AuthUser } from "@/contexts/AuthContext";

export function useAuth() {
  return useAuthContext();
}
