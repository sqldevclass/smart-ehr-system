import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AssessmentHistoryRow from "@/components/assessments/AssessmentHistoryRow";
import { groupAssessmentsByScale, type StayAssessment } from "@/lib/groupAssessmentsByScale";

interface Props {
  hospitalizationId: string;
}

/** Every scale assessment recorded during one hospitalization, grouped by scale. Read-only. */
export default function StayScalesHistory({ hospitalizationId }: Props) {
  const { data: groups, isLoading, error } = useQuery({
    queryKey: ["stay-assessments", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_assessments")
        .select(
          "id, total_score, assessed_at, profiles!assessed_by(full_name), assessment_scales!scale_id(code, name_ru)",
        )
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_voided", false)
        .order("assessed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return groupAssessmentsByScale((data ?? []) as unknown as StayAssessment[]);
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Загрузка...</p>;
  if (error) return <p className="text-xs text-destructive">Не удалось загрузить оценки</p>;
  if (!groups || groups.length === 0) {
    return <p className="text-xs text-muted-foreground">Нет оценок</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.code} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{group.name}</p>
          {group.assessments.map((assessment) => (
            <AssessmentHistoryRow key={assessment.id} assessment={assessment} scaleCode={group.code} />
          ))}
        </div>
      ))}
    </div>
  );
}
