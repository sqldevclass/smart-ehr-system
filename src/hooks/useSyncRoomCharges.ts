import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const BILLING_QUERY_ROOTS = new Set([
  "visit-invoice", "invoice-header", "invoice-items", "invoice-balance", "invoice-hosp",
  "patient-deposit-balance", "patient-deposit-balance-preview", "invoice-dialog-deposit-balance",
  "patient-latest-invoice", "patient-debt-invoices", "patient-debt-balances",
  "patient-history-groups", "patient-history-paid-amounts", "patient-total-outstanding",
  "patient-refundable-deposit", "patient-deposit-refunds", "patient-debts",
  "finance-discount-invoices", "finance-discount-items", "discount-report",
  "daily-report-items", "finance-services-items", "finance-revenue-items",
  "top-services-items", "cash-flow-items", "patient-advances",
]);

// Любой новый экран с суммами по счетам стационара должен использовать этот хук.
export function useSyncRoomCharges(): { ready: boolean } {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const sync = useQuery({
    queryKey: ["sync-room-charges"],
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sync_open_room_stay_charges");
      if (error) throw error;
      const count = Number(data ?? 0);
      if (count > 0) {
        await queryClient.invalidateQueries({
          predicate: (query) => BILLING_QUERY_ROOTS.has(String(query.queryKey[0])),
        });
      }
      return count;
    },
  });

  useEffect(() => {
    if (sync.error) console.error("Не удалось синхронизировать начисления палат:", sync.error);
  }, [sync.error]);

  return { ready: !!user && !sync.isPending && !sync.isFetching };
}