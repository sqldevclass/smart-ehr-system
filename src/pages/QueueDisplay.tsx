import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface QueueNumber {
  queue_number: number;
  status: string;
  patient_id: string | null;
}

export default function QueueDisplay() {
  const { displayToken } = useParams();
  const [config, setConfig] = useState<any>(null);
  const [numbers, setNumbers] = useState<QueueNumber[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch config by display_token
  useEffect(() => {
    if (!displayToken) return;
    (async () => {
      const { data, error: err } = await supabase
        .from("queue_configs")
        .select("id, physician_id, physicians(profiles(full_name))")
        .eq("display_token", displayToken)
        .maybeSingle();
      if (err || !data) {
        setError("Invalid display token.");
        setLoading(false);
        return;
      }
      setConfig(data);
      setLoading(false);
    })();
  }, [displayToken]);

  // Fetch queue numbers and subscribe to realtime
  useEffect(() => {
    if (!config) return;

    const fetchNumbers = async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("queue_numbers")
        .select("queue_number, status, patient_id")
        .eq("queue_config_id", config.id)
        .eq("queue_date", today)
        .order("queue_number");
      setNumbers(data || []);
    };

    fetchNumbers();

    const channel = supabase
      .channel(`queue-display-${config.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_numbers",
          filter: `queue_config_id=eq.${config.id}`,
        },
        () => {
          fetchNumbers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [config]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p className="text-xl animate-pulse">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p className="text-2xl text-red-400">{error}</p>
      </div>
    );
  }

  const physicianName = (config?.physicians as any)?.profiles?.full_name || "Physician";
  const calledNumbers = numbers.filter((n) => n.status === "called");
  const nowServing = calledNumbers.length > 0
    ? calledNumbers[calledNumbers.length - 1].queue_number
    : null;
  const waiting = numbers
    .filter((n) => n.status === "waiting")
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl md:text-5xl font-bold mb-12 text-center tracking-tight">
        {physicianName}
      </h1>

      <div className="text-center mb-16">
        <p className="text-lg uppercase tracking-[0.3em] text-slate-400 mb-4">Now Serving</p>
        <div className="text-[8rem] md:text-[10rem] font-bold leading-none tabular-nums text-emerald-400">
          {nowServing != null ? `#${nowServing}` : "---"}
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="text-center">
          <p className="text-lg uppercase tracking-[0.3em] text-slate-400 mb-6">Waiting</p>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {waiting.map((w) => (
              <div
                key={w.queue_number}
                className="text-4xl md:text-5xl font-semibold tabular-nums text-slate-300"
              >
                #{w.queue_number}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
