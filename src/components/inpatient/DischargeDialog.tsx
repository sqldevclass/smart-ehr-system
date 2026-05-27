import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type DischargeType = "discharged" | "transferred" | "deceased";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalizationId: string;
  patientName: string;
  onSuccess: () => void;
}

export default function DischargeDialog({
  open,
  onOpenChange,
  hospitalizationId,
  patientName,
  onSuccess,
}: Props) {
  const [dischargeType, setDischargeType] = useState<DischargeType>("discharged");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleDischarge = async () => {
    setSubmitting(true);
    const { error } = await supabase.rpc("discharge_patient", {
      p_hospitalization_id: hospitalizationId,
      p_discharge_type: dischargeType,
      p_discharge_notes: notes || null,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Пациент выписан");
      onSuccess();
      onOpenChange(false);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Выписка пациента</DialogTitle>
          <DialogDescription>{patientName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Тип выписки</Label>
            <Select
              value={dischargeType}
              onValueChange={(v: any) => setDischargeType(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discharged">Выписан</SelectItem>
                <SelectItem value="transferred">Переведён</SelectItem>
                <SelectItem value="deceased">Летальный исход</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Примечания (необязательно)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1 resize-none mt-1"
              rows={3}
              placeholder="Причина выписки, куда переведён и т.д."
            />
          </div>
          {dischargeType === "deceased" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              ⚠ Это действие необратимо. Убедитесь в правильности данных.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Отмена
          </Button>
          <Button
            variant={dischargeType === "deceased" ? "destructive" : "default"}
            onClick={handleDischarge}
            disabled={submitting}
          >
            {submitting ? "Выписка..." : "Подтвердить выписку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
