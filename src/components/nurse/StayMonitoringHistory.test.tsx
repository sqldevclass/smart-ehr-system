import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StayMonitoringHistory from "./StayMonitoringHistory";

const { db, rpc, failing, counts } = vi.hoisted(() => ({
  db: {} as Record<string, any[]>,
  rpc: vi.fn(),
  failing: new Set<string>(),
  counts: {} as Record<string, any>,
}));

// Minimal awaitable query-builder: rows are filtered by the .eq() filters, a table can be made to fail.
vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const result = () =>
      failing.has(table)
        ? { data: null, error: { message: "boom" } }
        : {
            data: (db[table] ?? []).filter((row) =>
              Object.entries(filters).every(([key, value]) => !(key in row) || row[key] === value),
            ),
            error: null,
          };
    const chain: any = {};
    for (const m of ["select", "neq", "order", "limit"]) chain[m] = () => chain;
    chain.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    };
    chain.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t), rpc: (...args: unknown[]) => rpc(...args) } };
});

const at = (h: number) => new Date(2026, 5, 10, h, 0).toISOString();

function setup(stayId = "stay-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StayMonitoringHistory hospitalizationId={stayId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  failing.clear();
  for (const key of Object.keys(db)) delete db[key];
  for (const key of Object.keys(counts)) delete counts[key];
  rpc.mockReset();
  rpc.mockImplementation(async (_name: string, args: { p_hospitalization_id: string }) => ({
    data: counts[args.p_hospitalization_id],
    error: null,
  }));
  db.patient_assessments = [
    {
      id: "a1", hospitalization_id: "stay-1", total_score: 12, assessed_at: at(10),
      profiles: { full_name: "Медсестра Тест" },
      assessment_scales: { code: "braden", name_ru: "Шкала Брадена" },
    },
  ];
  db.pain_scale_readings = [
    {
      id: "p1", hospitalization_id: "stay-1", score: 6, pain_character: ["Н"], pain_location: "Живот",
      recorded_at: at(11), profiles: { full_name: "Медсестра Тест" },
    },
    {
      id: "p-other", hospitalization_id: "another-stay", score: 9, pain_character: null, pain_location: "Не отсюда",
      recorded_at: at(12), profiles: null,
    },
  ];
  db.blood_glucose_readings = [
    { id: "g1", hospitalization_id: "stay-1", value_mmol: "9.1", recorded_at: at(8) },
  ];
  db.nursing_daily_notes = [
    {
      id: "n1", hospitalization_id: "stay-1", note_text: "Состояние стабильное.", recorded_at: at(7),
      profiles: { full_name: "Медсестра Тест" },
    },
  ];
});

describe("StayMonitoringHistory", () => {
  it("shows only the parts that have records, in a fixed order, each with a title", async () => {
    counts["stay-1"] = { scales: 1, pain: 1, glucose: 0, notes: 1 };
    setup();

    const titles = await screen.findAllByText(/^(Шкалы|Боль|Глюкоза крови|Дневниковые записи)$/);
    expect(titles.map((t) => t.textContent)).toEqual(["Шкалы", "Боль", "Дневниковые записи"]);
    expect(screen.queryByText("Глюкоза крови")).not.toBeInTheDocument();
  });

  it("shows each part's own records", async () => {
    counts["stay-1"] = { scales: 1, pain: 1, glucose: 1, notes: 1 };
    setup();

    expect(await screen.findByText("12 — Высокий риск")).toBeInTheDocument();
    expect(await screen.findByText("Живот")).toBeInTheDocument();
    expect(await screen.findByText("Ноющая")).toBeInTheDocument();
    expect(await screen.findByText("9.1", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("ммоль/л")).toBeInTheDocument();
    expect(await screen.findByText("Состояние стабильное.")).toBeInTheDocument();
  });

  it("only shows records of the stay it was given", async () => {
    counts["stay-1"] = { scales: 0, pain: 1, glucose: 0, notes: 0 };
    setup();
    expect(await screen.findByText("Живот")).toBeInTheDocument();
    expect(screen.queryByText("Не отсюда")).not.toBeInTheDocument();
  });

  it("says so when the stay has no records at all", async () => {
    counts["stay-1"] = { scales: 0, pain: 0, glucose: 0, notes: 0 };
    setup();
    expect(await screen.findByText("Нет записей")).toBeInTheDocument();
    expect(screen.queryByText("Шкалы")).not.toBeInTheDocument();
  });

  it("tells the user when a part is showing only the newest records of more", async () => {
    counts["stay-1"] = { scales: 0, pain: 120, glucose: 0, notes: 0 };
    setup();
    expect(await screen.findByText("Показаны последние 50 из 120")).toBeInTheDocument();
  });

  it("does not claim truncation when everything fits", async () => {
    counts["stay-1"] = { scales: 0, pain: 50, glucose: 0, notes: 0 };
    setup();
    await screen.findByText("Живот");
    expect(screen.queryByText(/Показаны последние/)).not.toBeInTheDocument();
  });

  it("shows an error when the counts cannot be loaded", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    setup();
    expect(await screen.findByText("Не удалось загрузить историю")).toBeInTheDocument();
  });

  it("a part that fails to load does not take the others down", async () => {
    counts["stay-1"] = { scales: 1, pain: 1, glucose: 0, notes: 1 };
    failing.add("pain_scale_readings");
    setup();
    expect(await screen.findByText("Не удалось загрузить записи")).toBeInTheDocument();
    expect(await screen.findByText("Состояние стабильное.")).toBeInTheDocument();
    expect(within(document.body).getByText("12 — Высокий риск")).toBeInTheDocument();
  });
});
