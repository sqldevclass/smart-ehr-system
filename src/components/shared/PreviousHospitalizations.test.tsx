import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PreviousHospitalizations from "./PreviousHospitalizations";

const { order, neq } = vi.hoisted(() => ({ order: vi.fn(), neq: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.neq = (...args: unknown[]) => {
    neq(...args);
    return chain;
  };
  chain.order = (...args: unknown[]) => order(...args);
  return { supabase: { from: () => chain } };
});

const stays = [
  { id: "s2", admitted_at: "2026-03-01T08:00:00Z", discharged_at: "2026-03-10T08:00:00Z", departments: { name: "Кардиология" } },
  { id: "s1", admitted_at: "2025-11-01T08:00:00Z", discharged_at: null, departments: null },
];

type Overrides = Partial<React.ComponentProps<typeof PreviousHospitalizations>>;

function setup(overrides: Overrides = {}) {
  const renderStay = vi.fn((id: string) => <div>DATA {id}</div>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PreviousHospitalizations
        patientId="p1"
        hospitalId="h1"
        currentHospitalizationId="cur"
        renderStay={renderStay}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { renderStay };
}

beforeEach(() => {
  order.mockReset();
  neq.mockReset();
});

describe("PreviousHospitalizations", () => {
  it("is closed by default and fetches nothing", () => {
    const { renderStay } = setup();
    expect(screen.getByRole("button", { name: /История госпитализаций/ })).toHaveAttribute("aria-expanded", "false");
    expect(order).not.toHaveBeenCalled();
    expect(renderStay).not.toHaveBeenCalled();
  });

  it("lists the other stays when opened, excluding the current one", async () => {
    order.mockResolvedValue({ data: stays, error: null });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));

    expect(await screen.findByText("01.03.2026 — 10.03.2026")).toBeInTheDocument();
    expect(screen.getByText("Кардиология")).toBeInTheDocument();
    expect(screen.getByText("01.11.2025 — по настоящее время")).toBeInTheDocument();
    expect(neq).toHaveBeenCalledWith("id", "cur");
  });

  it("renders a stay's data only while expanded, one stay at a time", async () => {
    order.mockResolvedValue({ data: stays, error: null });
    const { renderStay } = setup();
    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    await screen.findByText("01.03.2026 — 10.03.2026");
    expect(renderStay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("01.03.2026 — 10.03.2026"));
    expect(screen.getByText("DATA s2")).toBeInTheDocument();
    expect(renderStay).not.toHaveBeenCalledWith("s1");

    fireEvent.click(screen.getByText("01.11.2025 — по настоящее время"));
    expect(screen.getByText("DATA s1")).toBeInTheDocument();
    expect(screen.queryByText("DATA s2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("01.11.2025 — по настоящее время"));
    expect(screen.queryByText("DATA s1")).not.toBeInTheDocument();
  });

  it("says so when there are no other stays", async () => {
    order.mockResolvedValue({ data: [], error: null });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    expect(await screen.findByText("Предыдущих госпитализаций нет")).toBeInTheDocument();
  });

  it("shows an error instead of failing silently", async () => {
    order.mockResolvedValue({ data: null, error: { message: "boom" } });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    expect(await screen.findByText("Не удалось загрузить историю госпитализаций")).toBeInTheDocument();
  });

  it("closes again and hides the list", async () => {
    order.mockResolvedValue({ data: stays, error: null });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /История госпитализаций/ }));
    await screen.findByText("01.03.2026 — 10.03.2026");
    fireEvent.click(screen.getByRole("button", { name: /Скрыть историю/ }));
    await waitFor(() => expect(screen.queryByText("01.03.2026 — 10.03.2026")).not.toBeInTheDocument());
  });

  describe("without the toggle (collapsible={false})", () => {
    it("lists the stays straight away, with no show/hide button", async () => {
      order.mockResolvedValue({ data: stays, error: null });
      setup({ collapsible: false });
      expect(await screen.findByText("01.03.2026 — 10.03.2026")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /История госпитализаций|Скрыть историю/ })).not.toBeInTheDocument();
    });

    it("still renders a stay's data only once it is expanded", async () => {
      order.mockResolvedValue({ data: stays, error: null });
      const { renderStay } = setup({ collapsible: false });
      await screen.findByText("01.03.2026 — 10.03.2026");
      expect(renderStay).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText("01.03.2026 — 10.03.2026"));
      expect(screen.getByText("DATA s2")).toBeInTheDocument();
    });
  });

  describe("without a current stay to exclude", () => {
    it("lists every stay and does not filter any out", async () => {
      order.mockResolvedValue({ data: stays, error: null });
      setup({ collapsible: false, currentHospitalizationId: undefined });
      await screen.findByText("01.03.2026 — 10.03.2026");
      expect(neq).not.toHaveBeenCalled();
    });

    it("uses neutral wording when there are none", async () => {
      order.mockResolvedValue({ data: [], error: null });
      setup({ collapsible: false, currentHospitalizationId: undefined });
      expect(await screen.findByText("Госпитализаций нет")).toBeInTheDocument();
    });
  });
});
