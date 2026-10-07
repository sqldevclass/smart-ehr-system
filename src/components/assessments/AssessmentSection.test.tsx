import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssessmentSection from "./AssessmentSection";

const { db } = vi.hoisted(() => ({
  db: {
    scale: null as any,
    stays: [] as any[],
    assessmentsByStay: {} as Record<string, any[]>,
  },
}));

// Minimal awaitable query-builder: records .eq() filters and resolves per table.
vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const result = () => {
      if (table === "assessment_scales") return { data: db.scale, error: null };
      if (table === "hospitalizations") return { data: db.stays, error: null };
      if (table === "patient_assessments") {
        return { data: db.assessmentsByStay[filters.hospitalization_id as string] ?? [], error: null };
      }
      return { data: [], error: null };
    };
    const chain: any = {};
    for (const m of ["select", "neq", "order", "in", "limit"]) chain[m] = () => chain;
    chain.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    };
    chain.single = () => Promise.resolve(result());
    chain.maybeSingle = chain.single;
    chain.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t), rpc: vi.fn() } };
});

const FUTURE = new Date(Date.now() + 5 * 3600_000).toISOString();
const assessment = (id: string, score: number) => ({
  id,
  total_score: score,
  risk_level: "high",
  assessed_at: "2026-03-05T10:00:00Z",
  next_assessment_at: FUTURE,
  notes: null,
  profiles: { full_name: "Медсестра Тест" },
  patient_assessment_responses: [],
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssessmentSection
        scaleCode="braden"
        hospitalizationId="cur"
        patientId="p1"
        hospitalId="h1"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.scale = {
    id: "scale-1",
    code: "braden",
    name_ru: "Шкала Брадена",
    description_ru: null,
    min_score: 6,
    max_score: 23,
    lower_is_worse: true,
    assessment_scale_items: [],
  };
  db.stays = [
    { id: "past-1", admitted_at: "2026-03-01T08:00:00Z", discharged_at: "2026-03-10T08:00:00Z", departments: { name: "Терапия" } },
    { id: "past-2", admitted_at: "2025-11-01T08:00:00Z", discharged_at: "2025-11-09T08:00:00Z", departments: null },
  ];
  db.assessmentsByStay = {
    cur: [assessment("a-cur", 20)],
    "past-1": [assessment("a-past", 12)],
    "past-2": [],
  };
});

describe("AssessmentSection stay history", () => {
  it("normal mode keeps its header, add button and next-due line, and offers the history toggle", async () => {
    setup();
    expect(await screen.findByText("Шкала Брадена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Оценить" })).toBeInTheDocument();
    expect(await screen.findByText(/Следующая оценка/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /История госпитализаций/ })).toBeInTheDocument();
  });

  it("a past stay is read-only: no second header, add button, next-due line or nested toggle", async () => {
    setup();
    await screen.findByText(/Следующая оценка/);

    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    fireEvent.click(await screen.findByText("01.03.2026 — 10.03.2026"));

    // the past stay's own assessment is shown...
    expect(await screen.findByText(/Балл: 12/)).toBeInTheDocument();
    // ...but none of the editing / scheduling chrome is duplicated inside it
    expect(screen.getAllByText("Шкала Брадена")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "+ Оценить" })).toHaveLength(1);
    expect(screen.getAllByText(/Следующая оценка/)).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /История госпитализаций|Скрыть историю/ })).toHaveLength(1);
  });

  it("a past stay with no assessments says so", async () => {
    setup();
    await screen.findByText(/Следующая оценка/);
    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    fireEvent.click(await screen.findByText("01.11.2025 — 09.11.2025"));
    expect(await screen.findByText("Нет оценок")).toBeInTheDocument();
  });
});
