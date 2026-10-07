import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EWSSection from "./EWSSection";

const { db } = vi.hoisted(() => ({ db: {} as Record<string, any[]> }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", hospitalId: "h1", fullName: "Тест", roles: [], timezone: "Asia/Tashkent" },
  }),
}));

// Minimal awaitable query-builder: every table resolves to db[table]; .maybeSingle() takes the first row.
vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const rows = () => db[table] ?? [];
    const chain: any = {};
    for (const m of ["select", "eq", "neq", "lte", "or", "in", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
    chain.single = chain.maybeSingle;
    chain.then = (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej);
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t), rpc: vi.fn() } };
});

// Keep the real header (it owns the action buttons); stub only the heavy SVG chart, but let it render alertSlot.
vi.mock("./EWSChart", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./EWSChart")>();
  const React = await import("react");
  return {
    ...actual,
    default: ({ alertSlot }: { alertSlot?: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "chart" }, alertSlot),
  };
});

const reading = {
  id: "r1",
  total_score: 3,
  escalation_level: 1,
  next_due_at: null,
  recorded_at: "2026-10-06T10:00:00Z",
  notes: null,
  profiles: { full_name: "Медсестра Тест" },
  ews_reading_values: [],
};

const sepsisAlert = {
  id: "al1",
  alert_type: "paediatric_sepsis_6",
  triggered_at: "2026-10-06T10:00:00Z",
  trigger_signs: [],
  is_active: true,
  nurse_acknowledged_at: null,
  physician_acknowledged_at: null,
};

type Props = Partial<React.ComponentProps<typeof EWSSection>>;

function setup(props: Props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EWSSection
        hospitalizationId="cur"
        patientId="p1"
        hospitalId="h1"
        patientDateOfBirth="2015-01-01"
        patientGender="male"
        admittedAt="2026-10-01T00:00:00Z"
        viewerRole="nurse"
        {...props}
      />
    </QueryClientProvider>,
  );
}

const physician: Props = { viewerRole: "physician", canOverride: true, canEnterData: false };

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  db.ews_scales = [{ id: "sc1", code: "pews", name: "PEWS" }];
  db.ews_parameters = [
    { id: "p1", code: "hr", name_ru: "ЧСС", unit: "уд/мин", input_type: "number", display_order: 1 },
  ];
  db.ews_thresholds = [
    { parameter_id: "p1", min_value: 60, max_value: 100, text_value: null, score: 0, color: "green" },
  ];
});

describe("PEWS section: who can record vitals", () => {
  it("nurse: can start entering data from the empty state", async () => {
    setup();
    expect(await screen.findByText(/Показания ШРПУ ещё не внесены/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Внести данные" })).toBeInTheDocument();
  });

  it("physician: sees the empty state but has no way to enter data", async () => {
    setup(physician);
    expect(await screen.findByText(/Показания ШРПУ ещё не внесены/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Внести данные" })).not.toBeInTheDocument();
  });

  it("a plainly read-only viewer also cannot enter data (unchanged behavior)", async () => {
    setup({ isReadOnly: true });
    expect(await screen.findByText(/Показания ШРПУ ещё не внесены/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Внести данные" })).not.toBeInTheDocument();
  });

  it("nurse: header offers data entry but not threshold editing", async () => {
    db.ews_readings = [reading];
    setup();
    expect(await screen.findByRole("button", { name: "+ Внести данные" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Изменить границы нормы" })).not.toBeInTheDocument();
  });

  it("physician: header offers threshold editing only, no data entry", async () => {
    db.ews_readings = [reading];
    setup(physician);
    expect(await screen.findByRole("button", { name: "Изменить границы нормы" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Внести данные" })).not.toBeInTheDocument();
  });

  it("the 'needs entry' prompt is shown to a nurse but not to a physician", async () => {
    db.ews_readings = [reading];
    db.ews_schedule = [{ next_due_at: "2020-01-01T00:00:00Z", last_score: 3 }];

    setup();
    expect(await screen.findByText("Необходимо внести ШРПУ")).toBeInTheDocument();
  });

  it("physician: the 'needs entry' prompt is hidden even when a reading is overdue", async () => {
    db.ews_readings = [reading];
    db.ews_schedule = [{ next_due_at: "2020-01-01T00:00:00Z", last_score: 3 }];

    setup(physician);
    await screen.findByTestId("chart");
    expect(screen.queryByText("Необходимо внести ШРПУ")).not.toBeInTheDocument();
  });
});

describe("PEWS section: sepsis alert acknowledgement must survive the change", () => {
  it("physician without data entry can still acknowledge a pediatric sepsis alert", async () => {
    db.clinical_alerts = [sepsisAlert];
    setup(physician);
    expect(await screen.findByText("Подтвердить и принять к сведению")).toBeInTheDocument();
  });

  it("a read-only viewer still cannot acknowledge it (unchanged behavior)", async () => {
    db.clinical_alerts = [sepsisAlert];
    setup({ ...physician, isReadOnly: true, canOverride: false });
    expect(await screen.findByText(/ПЕДИАТРИЧЕСКИЙ СЕПСИС/)).toBeInTheDocument();
    expect(screen.queryByText("Подтвердить и принять к сведению")).not.toBeInTheDocument();
  });
});

describe("PEWS section: hospitalization history", () => {
  it("is available to physicians too, closed by default", async () => {
    setup(physician);
    const toggle = await screen.findByRole("button", { name: /История госпитализаций/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
