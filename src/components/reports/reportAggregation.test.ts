import { describe, expect, it } from "vitest";
import { aggregateSummary } from "./reportAggregation";

const types = [
  { id: "p", code: "polyclinic", name_ru: "Polyclinic" },
  { id: "c", code: "consultation", name_ru: "Consultation" },
  { id: "a", code: "angiography", name_ru: "Angiography" },
];

describe("Daily Summary category rules", () => {
  it("deduplicates visitors across polyclinic and consultation while summing services and revenue", () => {
    const rows = aggregateSummary(types, [
      { service_type_id: "p", patient_id: "patient1", cost_at_time: 100 },
      { service_type_id: "c", patient_id: "patient1", cost_at_time: 200 },
      { service_type_id: "c", patient_id: "patient2", cost_at_time: 50 },
    ], [{ service_type_id: "p", cost_at_time: 75 }, { service_type_id: "c", cost_at_time: 25 }], {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "polyclinic_consultation", visitorCount: 2, serviceCount: 3, revenue: 350, priorYearRevenue: 100 });
  });

  it("sums plans for the merged row without changing the original individual plans", () => {
    const plans = { p: 1000, c: 500, a: 200 };
    const rows = aggregateSummary(types, [], [], plans);
    expect(rows.find(row => row.id === "polyclinic_consultation")?.target).toBe(1500);
    expect(rows.find(row => row.id === "a")?.target).toBe(200);
    expect(plans).toEqual({ p: 1000, c: 500, a: 200 });
  });
});