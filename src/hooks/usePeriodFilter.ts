import { useCallback, useState } from "react";
import { format } from "date-fns";
import type { PeriodState } from "@/components/shared/PeriodFilter";

export function usePeriodFilter(defaultToday: boolean): [PeriodState, (s: PeriodState) => void] {
  const [state, setRaw] = useState<PeriodState>(() => {
    if (!defaultToday) return { period: "custom" };
    const today = format(new Date(), "yyyy-MM-dd");
    return { period: "custom", customFrom: today, customTo: today };
  });
  const setState = useCallback((s: PeriodState) => {
    if (s.customFrom && s.customTo && s.customFrom > s.customTo) {
      setRaw({ ...s, customFrom: s.customTo, customTo: s.customFrom });
    } else {
      setRaw(s);
    }
  }, []);
  return [state, setState];
}
