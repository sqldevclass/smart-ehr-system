import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PatientAssessmentHistory from "./PatientAssessmentHistory";

const { db } = vi.hoisted(() => ({ db: { stays: [] as any[], assessments: [] as any[] } }));

vi.mock("@/integrations/supabase/client", () => {
  const makeChain = (table: string) => {
    const chain: any = {};
    for (const m of ["select", "eq", "neq", "order", "limit"]) chain[m] = () => chain;
    chain.then = (res: any, rej: any) =>
      Promise.resolve({ data: table === "hospitalizations" ? db.stays : db.assessments, error: null }).then(res, rej);
    return chain;
  };
  return { supabase: { from: (t: string) => makeChain(t) } };
});

describe("PatientAssessmentHistory (physician Шкалы tab)", () => {
  it("lists every stay straight away and shows all scales of a stay when it is expanded", async () => {
    db.stays = [
      { id: "now", admitted_at: "2026-06-27T08:00:00Z", discharged_at: null, departments: { name: "Кардиология" } },
      { id: "old", admitted_at: "2026-06-08T08:00:00Z", discharged_at: "2026-06-27T08:00:00Z", departments: { name: "Кардиология" } },
    ];
    db.assessments = [
      {
        id: "a1",
        total_score: 8,
        assessed_at: "2026-06-10T10:00:00Z",
        profiles: { full_name: "Медсестра Тест" },
        assessment_scales: { code: "humpty_dumpty", name_ru: "Шкала Хампти Дампти" },
      },
    ];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PatientAssessmentHistory patientId="p1" hospitalId="h1" />
      </QueryClientProvider>,
    );

    // both stays (including the current one) are listed with no "show history" toggle
    expect(await screen.findByText("08.06.2026 — 27.06.2026")).toBeInTheDocument();
    expect(screen.getByText("27.06.2026 — по настоящее время")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /История госпитализаций|Скрыть историю/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("08.06.2026 — 27.06.2026"));
    expect(await screen.findByText("Шкала Хампти Дампти")).toBeInTheDocument();
    expect(screen.getByText(/^8 — /)).toBeInTheDocument();
  });
});
