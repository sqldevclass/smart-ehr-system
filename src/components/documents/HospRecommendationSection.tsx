import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  visitId: string;
  hospitalId: string;
  isReadOnly: boolean;
  visitData: any;
  onSaved: () => void;
}

export default function HospRecommendationSection({
  visitId,
  hospitalId,
  isReadOnly,
  visitData,
  onSaved,
}: Props) {
  const [enabled, setEnabled] = useState(
    () => !!visitData?.hosp_recommended_department_id
  );
  const [departmentId, setDepartmentId] = useState(
    () => visitData?.hosp_recommended_department_id ?? ""
  );
  const [urgency, setUrgency] = useState<"planned" | "emergency">(
    () => visitData?.hosp_recommended_urgency ?? "planned"
  );
  const [notes, setNotes] = useState(
    () => visitData?.hosp_recommended_notes ?? ""
  );
  const [saving, setSaving] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-for-notes", hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!enabled) {
        await supabase
          .from("visits")
          .update({
            hosp_recommended_department_id: null,
            hosp_recommended_urgency: null,
            hosp_recommended_notes: null,
            hosp_recommended_at: null,
            hosp_recommended_by: null,
            hospitalization_recommended: false,
          })
          .eq("id", visitId);
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await supabase
          .from("visits")
          .update({
            hosp_recommended_department_id: departmentId || null,
            hosp_recommended_urgency: urgency,
            hosp_recommended_notes: notes || null,
            hosp_recommended_at: new Date().toISOString(),
            hosp_recommended_by: session?.user.id ?? null,
            hospitalization_recommended: true,
          })
          .eq("id", visitId);
      }
      onSaved();
      toast.success("Сохранено");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          Направление на госпитализацию
        </h3>
        {!isReadOnly && (
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        )}
      </div>
      {enabled && (
        <div className="space-y-4">
          <div>
            <Label className="text-sm">Отделение</Label>
            <Select
              value={departmentId}
              onValueChange={setDepartmentId}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите отделение" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Срочность</Label>
            <Select
              value={urgency}
              onValueChange={(v) =>
                setUrgency(v as "planned" | "emergency")
              }
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Плановая</SelectItem>
                <SelectItem value="emergency">Экстренная</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Причина госпитализации</Label>
            {isReadOnly ? (
              <p className="text-sm mt-1">{notes || "—"}</p>
            ) : (
              <Select value={notes} onValueChange={setNotes}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите услугу" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s: any) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {visitData?.hospitalization_recommended && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
              <span>✓</span>
              <span>Направлено на госпитализацию</span>
            </div>
          )}

          {!isReadOnly && (
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !departmentId}
              onClick={handleSave}
            >
              {saving ? "..." : "Сохранить направление"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
