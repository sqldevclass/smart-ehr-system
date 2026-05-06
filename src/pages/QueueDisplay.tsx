import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface QueueEntry {
  id: string;
  queue_number: number;
  status: string;
  visit_service_id: string | null;
  visit_services: {
    status_id: string;
    service_statuses: { code: string } | null;
  } | null;
}

export default function QueueDisplay() {
  const { displayToken } = useParams();
  const [config, setConfig] = useState<any>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const fetchEntries = useCallback(async () => {
    if (!config) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("queue_numbers")
      .select("id, queue_number, status, visit_service_id, visit_services(status_id, service_statuses(code))")
      .eq("queue_config_id", config.id)
      .gte("issued_at", todayStart.toISOString())
      .lte("issued_at", todayEnd.toISOString())
      .order("queue_number", { ascending: true });
    setEntries((data as unknown as QueueEntry[]) || []);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    fetchEntries();

    const ch1 = supabase
      .channel(`queue-display-qn-${config.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_numbers", filter: `queue_config_id=eq.${config.id}` }, () => fetchEntries())
      .subscribe();

    const ch2 = supabase
      .channel(`queue-display-vs-${config.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "visit_services" }, () => fetchEntries())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [config, fetchEntries]);

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

  const getCode = (e: QueueEntry) => e.visit_services?.service_statuses?.code;

  const physicianName = (config?.physicians as any)?.profiles?.full_name || "Physician";

  const nowServing = entries.find((e) => getCode(e) === "ready_for_execution");

  const waiting = entries
    .filter((e) => {
      const code = getCode(e);
      if (!code) return false;
      if (code !== "preliminary" && code !== "ready_for_execution") return false;
      if (nowServing && e.id === nowServing.id) return false;
      return true;
    })
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl md:text-5xl font-bold mb-12 text-center tracking-tight">
        {physicianName}
      </h1>

      <div className="text-center mb-16">
        <p className="text-lg uppercase tracking-[0.3em] text-slate-400 mb-4">Now Serving</p>
        <div className="text-9xl font-bold leading-none tabular-nums text-emerald-400">
          {nowServing ? `#${nowServing.queue_number}` : "---"}
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="text-center">
          <p className="text-lg uppercase tracking-[0.3em] text-slate-400 mb-6">Waiting</p>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {waiting.map((w) => (
              <div key={w.id} className="text-4xl md:text-5xl font-semibold tabular-nums text-slate-300">
                #{w.queue_number}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
