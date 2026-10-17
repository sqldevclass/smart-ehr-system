import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown[]>,
  queries: [] as { queryFn: () => Promise<unknown> }[],
  calculated: [] as unknown[],
  eq: vi.fn(),
}));

vi.mock("react", async importOriginal => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useMemo: (fn: () => unknown) => {
    const result = fn(); state.calculated.push(result); return result;
  } };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { hospitalId: "hospital" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: { queryKey: string[]; queryFn: () => Promise<unknown> }) => {
  state.queries.push(options);
  return { data: state.data[options.queryKey[0]] ?? [], isLoading: false };
} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const chain = {
    select: () => chain, eq: (...args: unknown[]) => { state.eq(...args); return chain; },
    gte: () => chain, lte: () => chain,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return chain;
} } }));
vi.mock("@/components/reports/DailyReportSummaryChart", () => ({ default: () => null }));

import CashInflowTab from "./CashInflowTab";
import TopServicesTab from "./TopServicesTab";
import RegistrationSourceTab from "./RegistrationSourceTab";

const bounds = { from: "2026-10-01T00:00:00Z", to: "2026-10-31T23:59:59Z" };
beforeEach(() => { state.data = {}; state.queries = []; state.calculated = []; state.eq.mockClear(); });

it("ranks and limits Top Services to 100 completed services", async () => {
  state.data["top-services-items"] = Array.from({ length: 105 }, (_, i) => ({ service_name: `Service ${i}`, revenue: i }));
  render(<TopServicesTab {...bounds} />);
  const rows = state.calculated[0] as { revenue: number }[];
  expect(rows).toHaveLength(100);
  expect(rows[0].revenue).toBe(104);
  expect(rows[99].revenue).toBe(5);
  await state.queries[0].queryFn();
  expect(state.eq).toHaveBeenCalledWith("service_status_code", "completed");
  expect(state.eq).toHaveBeenCalledWith("hospital_id", "hospital");
});

it("excludes refunded payments in both cash-inflow periods and sums by payment method", async () => {
  state.data["cash-inflow-items"] = [
    { payment_method_code: "cash", payment_method_name: "Cash", amount: 100 },
    { payment_method_code: "cash", payment_method_name: "Cash", amount: 50 },
  ];
  state.data["cash-inflow-items-prior-year"] = [{ payment_method_code: "cash", amount: 75 }];
  render(<CashInflowTab {...bounds} />);
  expect(state.calculated[0]).toEqual([{ name: "Cash", amount: 150, count: 2, priorAmount: 75 }]);
  await Promise.all(state.queries.map(query => query.queryFn()));
  expect(state.eq.mock.calls.filter(call => call[0] === "is_refunded")).toEqual([
    ["is_refunded", false], ["is_refunded", false],
  ]);
});

it("includes visits without an acquisition source in the count and percentage denominator", () => {
  state.data["registration-source-items"] = [
    { registration_source: "facebook" }, { registration_source: null }, { registration_source: "facebook" }, { registration_source: null },
  ];
  render(<RegistrationSourceTab {...bounds} />);
  const rows = state.calculated[0] as { key: string; count: number; pct: number }[];
  expect(rows.find(row => row.key === "not_specified")).toMatchObject({ count: 2, pct: 50 });
  expect(rows.find(row => row.key === "facebook")).toMatchObject({ count: 2, pct: 50 });
});