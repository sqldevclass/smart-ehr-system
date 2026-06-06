import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  physicianId: string;
  hospitalId: string;
  selectedDate: Date;
  timezone: string;
  onQueueSelect?: (date: Date) => void;
}

export function QueuePanel({ physicianId, hospitalId, selectedDate, onQueueSelect }: Props) {
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data: config } = useQuery({
    queryKey: ["booking-queue-config", physicianId, hospitalId, dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("queue_configs")
        .select("id, last_number, queue_date")
        .eq("staff_role_id", physicianId)
        .eq("hospital_id", hospitalId)
        .eq("queue_date", dateStr)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    onQueueSelect?.(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, physicianId]);

  const next = (config?.last_number ?? 0) + 1;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 px-6 py-10 text-center">
      <CheckCircle2 className="h-10 w-10 text-emerald-500" />
      <div className="text-3xl font-bold tracking-tight text-foreground">Queue #{next}</div>
      <p className="text-sm text-muted-foreground">
        Patient will receive queue number <span className="font-medium text-foreground">{next}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        No slot selection needed — the queue number is assigned automatically on booking.
      </p>
    </div>
  );
}
