interface ServiceType { id: string; code: string; name_ru: string }
interface ServiceItem { service_type_id: string | null; patient_id?: string; cost_at_time: number }

export function aggregateSummary(
  types: ServiceType[], items: ServiceItem[], priorItems: ServiceItem[], plans: Record<string, number>,
) {
  const groups = new Map<string, { name: string; ids: Set<string> }>();
  for (const type of types) {
    if (type.code === "test") continue;
    const merged = type.code === "polyclinic" || type.code === "consultation";
    const key = merged ? "polyclinic_consultation" : type.id;
    const name = merged ? "Поликлиника-консультации" : type.code === "angiography" ? "Катлаб" : type.name_ru;
    const group = groups.get(key) ?? { name, ids: new Set<string>() };
    group.ids.add(type.id);
    groups.set(key, group);
  }
  return Array.from(groups, ([id, group]) => {
    const matches = items.filter(i => i.service_type_id !== null && group.ids.has(i.service_type_id));
    const prior = priorItems.filter(i => i.service_type_id !== null && group.ids.has(i.service_type_id));
    return {
      id, name: group.name, serviceCount: matches.length,
      visitorCount: new Set(matches.map(i => i.patient_id)).size,
      revenue: matches.reduce((sum, i) => sum + Number(i.cost_at_time || 0), 0),
      priorYearRevenue: prior.reduce((sum, i) => sum + Number(i.cost_at_time || 0), 0),
      target: Array.from(group.ids).reduce((sum, typeId) => sum + (plans[typeId] || 0), 0),
    };
  }).filter(row => row.serviceCount > 0 || row.target > 0).sort((a, b) => b.revenue - a.revenue);
}