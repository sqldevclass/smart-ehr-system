import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NurseMonitoringPanel from "./NurseMonitoringPanel";

const { db, rpc, counts } = vi.hoisted(() => ({
  db: {} as Record<string, any[]>,
  rpc: vi.fn(),
  counts: {} as Record<string, any>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", hospitalId: "h1", fullName: "Тест", roles: [], timezone: "Asia/Tashkent" },
  }),
}));

// Minimal awaitable query-builder: rows are filtered by the .eq() filters; .maybeSingle() takes the first row.
vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const rows = () =>
      (db[table] ?? []).filter((row) =>
        Object.entries(filters).every(([key, value]) => !(key in row) || row[key] === value),
      );
    const chain: any = {};
    for (const m of ["select", "neq", "lte", "gte", "or", "in", "is", "not", "order", "limit", "range"]) {
      chain[m] = () => chain;
    }
    chain.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
    chain.single = chain.maybeSingle;
    chain.then = (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej);
    return chain;
  };
  const channel = () => {
    const c: any = { on: () => c, subscribe: () => c, unsubscribe: () => {} };
    return c;
  };
  return {
    supabase: {
      from: (t: string) => makeChain(t),
      rpc: (...args: unknown[]) => rpc(...args),
      channel,
      removeChannel: () => {},
    },
  };
});

const soon = new Date(Date.now() + 3 * 3600_000).toISOString();
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NurseMonitoringPanel
        hospitalizationId="cur"
        patientId="p1"
        hospitalId="h1"
        patientDateOfBirth="1990-01-01"
        patientGender="male"
        fallRiskScaleCode="morse"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  for (const key of Object.keys(counts)) delete counts[key];
  rpc.mockReset();
  rpc.mockImplementation(async (_name: string, args: { p_hospitalization_id: string }) => ({
    data: counts[args.p_hospitalization_id],
    error: null,
  }));

  db.hospitalization_active_forms = [{ scale_code: "daily_notes" }];
  db.assessment_scales = [
    { id: "s1", code: "braden", name_ru: "Шкала Брадена", description_ru: null, min_score: 6, max_score: 23, lower_is_worse: true, assessment_scale_items: [] },
  ];

  // current stay
  db.blood_glucose_readings = [
    { id: "g-cur", hospitalization_id: "cur", value_mmol: "9.1", recorded_at: ago(2), notes: null, profiles: null },
    { id: "g-old", hospitalization_id: "old", value_mmol: "4.4", recorded_at: ago(500), notes: null, profiles: null },
  ];
  db.pain_scale_readings = [
    { id: "p-new", hospitalization_id: "cur", scale_type: "nrs", score: 8, pain_character: ["Ж"], pain_location: "Грудная клетка", recorded_at: ago(1), notes: null, medication_route: null, next_assessment_at: soon, profiles: { full_name: "Мед Два" } },
    { id: "p-older", hospitalization_id: "cur", scale_type: "nrs", score: 4, pain_character: null, pain_location: "Спина", recorded_at: ago(9), notes: null, medication_route: null, next_assessment_at: soon, profiles: null },
    { id: "p-old", hospitalization_id: "old", scale_type: "nrs", score: 6, pain_character: null, pain_location: "Живот", recorded_at: ago(500), notes: null, medication_route: null, next_assessment_at: null, profiles: null },
  ];
  db.nursing_daily_notes = [
    { id: "n-cur", hospitalization_id: "cur", note_text: "Жалоб нет сегодня.", recorded_at: ago(3), profiles: { full_name: "Мед Один" } },
  ];

  // a previous stay
  db.hospitalizations = [
    { id: "old", admitted_at: "2026-03-01T08:00:00Z", discharged_at: "2026-03-10T08:00:00Z", departments: { name: "Кардиология" } },
  ];
  counts.old = { scales: 0, pain: 1, glucose: 1, notes: 0 };
});

describe("NurseMonitoringPanel: live cards", () => {
  it("still shows glucose, pain and daily notes of the current stay", async () => {
    setup();
    expect(await screen.findByText("Грудная клетка")).toBeInTheDocument();
    expect(screen.getByText("Спина")).toBeInTheDocument();
    expect(screen.getByText("ммоль/л")).toBeInTheDocument();
    // the notes card appears once the "active forms" query has told the panel it is on
    expect(await screen.findByText("Жалоб нет сегодня.")).toBeInTheDocument();
    expect(screen.getByText("· Мед Один")).toBeInTheDocument();
    // none of the previous stay's records leak into the live cards
    expect(screen.queryByText("Живот")).not.toBeInTheDocument();
  });

  it("shows the next-due line on the latest pain reading only", async () => {
    setup();
    await screen.findByText("Грудная клетка");
    expect(screen.getAllByText(/Следующая оценка:/)).toHaveLength(1);
  });
});

describe("NurseMonitoringPanel: one hospitalization history at the bottom", () => {
  it("is a single section, closed by default, and requests nothing until opened", async () => {
    setup();
    await screen.findByText("Грудная клетка");
    expect(screen.getAllByRole("button", { name: /История госпитализаций/ })).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("opens to the previous stays, and a stay shows only the parts that have records", async () => {
    setup();
    await screen.findByText("Грудная клетка");

    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    const stayRow = await screen.findByText("01.03.2026 — 10.03.2026");
    expect(screen.getByText("Кардиология")).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled(); // nothing is loaded for a stay until it is expanded

    fireEvent.click(stayRow);
    const stay = stayRow.closest("div.border") as HTMLElement;
    expect(await within(stay).findByText("Живот")).toBeInTheDocument();
    expect(within(stay).getByText("Боль")).toBeInTheDocument();
    expect(within(stay).getByText("Глюкоза крови")).toBeInTheDocument();
    expect(within(stay).getByText("4.4", { exact: false })).toBeInTheDocument();
    // no records of these kinds in that stay, so no empty blocks for them
    expect(within(stay).queryByText("Шкалы")).not.toBeInTheDocument();
    expect(within(stay).queryByText("Дневниковые записи")).not.toBeInTheDocument();
  });
});
