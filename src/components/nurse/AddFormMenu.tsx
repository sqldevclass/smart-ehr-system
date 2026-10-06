import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  hospitalizationId: string;
  hospitalId: string;
  isReadOnly?: boolean;
}

export default function AddFormMenu({ hospitalizationId, hospitalId, isReadOnly = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: activeFormsData = [] } = useQuery({
    queryKey: ["active-forms", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_active_forms")
        .select("scale_code")
        .eq("hospitalization_id", hospitalizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const activeFormCodes = useMemo(
    () => new Set((activeFormsData as any[]).map((f) => f.scale_code)),
    [activeFormsData],
  );

  const { data: optionalScales = [] } = useQuery({
    queryKey: ["optional-scales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_scales")
        .select("id, code, name_ru")
        .eq("is_optional", true);
      if (error) throw error;
      return data || [];
    },
  });

  const availableForms = useMemo(() => {
    const all = [
      ...(optionalScales as any[]).map((s) => ({ code: s.code, name: s.name_ru })),
      { code: "fluid_balance", name: "Баланс жидкости" },
      { code: "daily_notes", name: "Дневниковые записи" },
      { code: "device_monitoring", name: "Инфекционный контроль" },
    ];
    return all.filter((f) => !activeFormCodes.has(f.code));
  }, [optionalScales, activeFormCodes]);

  const handleActivateForm = async (scaleCode: string) => {
    const { error } = await supabase.from("hospitalization_active_forms").insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      scale_code: scaleCode,
      activated_by: user!.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["active-forms", hospitalizationId] });
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => setOpen(!open)}
        disabled={isReadOnly}
      >
        Добавить форму ▾
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-50 min-w-52 py-1">
          {availableForms.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Все формы добавлены</div>
          ) : (
            availableForms.map((f) => (
              <button
                key={f.code}
                onClick={() => handleActivateForm(f.code)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
              >
                {f.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
