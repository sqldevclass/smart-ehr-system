import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StayScalesHistory from "./StayScalesHistory";

const { result } = vi.hoisted(() => ({ result: { data: [] as any[], error: null as any } }));

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  chain.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  return { supabase: { from: () => chain } };
});

const row = (id: string, code: string, name: string, score: number) => ({
  id,
  total_score: score,
  assessed_at: "2026-03-05T10:00:00Z",
  profiles: { full_name: "Медсестра Тест" },
  assessment_scales: { code, name_ru: name },
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StayScalesHistory hospitalizationId="stay-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  result.data = [];
  result.error = null;
});

describe("StayScalesHistory", () => {
  it("shows every scale of the stay together, in a fixed order, each with its own heading", async () => {
    result.data = [
      row("1", "cpot", "CPOT", 7),
      row("2", "morse", "Шкала Морзе", 60),
      row("3", "braden", "Шкала Брадена", 12),
      row("4", "braden", "Шкала Брадена", 20),
    ];
    setup();

    const headings = await screen.findAllByText(/^(CPOT|Шкала Морзе|Шкала Брадена)$/);
    expect(headings.map((h) => h.textContent)).toEqual(["Шкала Брадена", "Шкала Морзе", "CPOT"]);

    expect(screen.getByText("12 — Высокий риск")).toBeInTheDocument();
    expect(screen.getByText("20 — Нет риска")).toBeInTheDocument();
    expect(screen.getByText("60 — Высокий риск падения")).toBeInTheDocument();
    expect(screen.getByText("7 — Сильная боль")).toBeInTheDocument();
  });

  it("keeps each assessment under its own scale", async () => {
    result.data = [row("1", "braden", "Шкала Брадена", 12), row("2", "morse", "Шкала Морзе", 60)];
    setup();
    const braden = (await screen.findByText("Шкала Брадена")).parentElement as HTMLElement;
    expect(within(braden).getByText("12 — Высокий риск")).toBeInTheDocument();
    expect(within(braden).queryByText("60 — Высокий риск падения")).not.toBeInTheDocument();
  });

  it("says so when the stay has no assessments", async () => {
    setup();
    expect(await screen.findByText("Нет оценок")).toBeInTheDocument();
  });

  it("shows an error instead of an empty list when loading fails", async () => {
    result.error = { message: "boom" };
    setup();
    expect(await screen.findByText("Не удалось загрузить оценки")).toBeInTheDocument();
  });
});
