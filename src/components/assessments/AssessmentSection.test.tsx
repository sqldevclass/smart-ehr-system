import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssessmentSection from "./AssessmentSection";

const { db } = vi.hoisted(() => ({ db: { scale: null as any, assessments: [] as any[] } }));

// Minimal awaitable query-builder: resolves per table.
vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const result = () =>
      table === "assessment_scales"
        ? { data: db.scale, error: null }
        : { data: table === "patient_assessments" ? db.assessments : [], error: null };
    const chain: any = {};
    for (const m of ["select", "eq", "neq", "order", "in", "limit"]) chain[m] = () => chain;
    chain.single = () => Promise.resolve(result());
    chain.maybeSingle = chain.single;
    chain.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t), rpc: vi.fn() } };
});

const FUTURE = new Date(Date.now() + 5 * 3600_000).toISOString();
const assessment = (id: string, score: number, assessedAt: string) => ({
  id,
  total_score: score,
  risk_level: "high",
  assessed_at: assessedAt,
  next_assessment_at: FUTURE,
  notes: null,
  profiles: { full_name: "Медсестра Тест" },
  patient_assessment_responses: [],
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssessmentSection scaleCode="braden" hospitalizationId="cur" patientId="p1" hospitalId="h1" />
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
  db.assessments = [
    assessment("new", 20, "2026-03-05T10:00:00Z"),
    assessment("old", 12, "2026-03-04T10:00:00Z"),
  ];
});

describe("AssessmentSection", () => {
  it("shows its header, add button and next-due line, and no per-card hospitalization history", async () => {
    setup();
    expect(await screen.findByText("Шкала Брадена")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Оценить" })).toBeInTheDocument();
    expect(await screen.findByText(/Следующая оценка/)).toBeInTheDocument();
    // hospitalization history now lives in one section for the whole panel, not on each card
    expect(screen.queryByRole("button", { name: /История госпитализаций/ })).not.toBeInTheDocument();
  });

  it("lists the older assessments of the current stay with their risk label", async () => {
    setup();
    expect(await screen.findByText("История оценок")).toBeInTheDocument();
    expect(screen.getByText("12 — Высокий риск")).toBeInTheDocument();
  });
});
