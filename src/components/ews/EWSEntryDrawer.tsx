/* ============================================================================
   EWSEntryDrawer — "Внести показания", Direction A look, extended with
   enum-parameter support (consciousness A/V/P/U/C, oxygen delivery) that
   the original upload's PewsEntryDrawer did not have. Without this, the
   drawer would silently drop two real clinical fields the current inline
   form supports today.

   Presentational + callbacks only, same as the upload intended — wire
   onSave to the real submit_ews_reading RPC call in EWSSection.
   ============================================================================ */
import { useMemo, useState } from "react";

const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums",
};

type Sev = "low" | "watch" | "mid" | "high";
const SEV: Record<Sev, { label: string; color: string; bg: string }> = {
  low: { label: "Низкий риск", color: "#15803D", bg: "#F0FDF4" },
  watch: { label: "Под наблюдением", color: "#A16207", bg: "#FEFCE8" },
  mid: { label: "Средний риск", color: "#C2410C", bg: "#FFF7ED" },
  high: { label: "Высокий риск", color: "#DC2626", bg: "#FEF2F2" },
};
const severityOf = (s: number): Sev => (s >= 7 ? "high" : s >= 4 ? "mid" : s >= 1 ? "watch" : "low");

const CHIP = {
  normal: { label: "Норма", color: "#15803D", bg: "#F0FDF4" },
  amber: { label: "Внимание", color: "#C2410C", bg: "#FFF7ED" },
  red: { label: "Тревога", color: "#B91C1C", bg: "#FEF2F2" },
} as const;
type Status = keyof typeof CHIP;
const statusFromScore = (s: number): Status => (s >= 2 ? "red" : s === 1 ? "amber" : "normal");

export interface EwsEntryParam {
  id: string;
  code: string;
  name_ru: string;
  unit?: string;
  input_type: "numeric" | "integer" | "enum";
  normLo?: number | null;
  normHi?: number | null;
  /** Same signature as this app's existing calculateScore(paramId, value, inputType).score */
  scoreFor: (value: string) => number;
  /** Only present for consciousness -- toggles the NEWS2-only "confusion" option */
  showConfusionOption?: boolean;
}

export function EWSEntryDrawer({
  params,
  initialValues = {},
  datetime,
  interval = "непрерывный мониторинг",
  scaleLabel = "PEWS 5–11 лет",
  saving = false,
  onSave,
  onCancel,
}: {
  params: EwsEntryParam[];
  initialValues?: Record<string, string>;
  datetime: string;
  interval?: string;
  scaleLabel?: string;
  saving?: boolean;
  onSave?: (values: Record<string, string>, score: number, notes: string) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    params.forEach((p) => (v[p.id] = initialValues[p.id] ?? ""));
    return v;
  });
  const [notes, setNotes] = useState("");

  const { score, sev } = useMemo(() => {
    let total = 0;
    params.forEach((p) => {
      const val = values[p.id];
      if (val !== "") total += p.scoreFor(val);
    });
    return { score: total, sev: severityOf(total) };
  }, [values, params]);
  const s = SEV[sev];

  const setVal = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <div className="w-[420px] overflow-hidden rounded-2xl border bg-card" style={{ borderColor: "hsl(var(--border))", boxShadow: "var(--shadow-elevated)" }}>
      <div className="flex items-center justify-between px-5 pb-3.5 pt-[18px]">
        <div>
          <div className="text-[17px] font-semibold" style={{ color: "hsl(var(--card-foreground))" }}>Внести показания</div>
          <div className="mt-0.5 text-xs" style={{ ...MONO, color: "hsl(var(--muted-foreground))" }}>ШРПУ · {scaleLabel}</div>
        </div>
        <button onClick={onCancel} aria-label="Закрыть" className="grid h-[30px] w-[30px] place-items-center rounded-lg text-[13px]" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>✕</button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>Дата и время</span>
          <input readOnly value={datetime} className="rounded-md border px-2.5 py-2.5 text-xs" style={{ ...MONO, borderColor: "hsl(var(--border))", background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>Интервал</span>
          <input readOnly value={interval} className="rounded-md border px-2.5 py-2.5 text-[13px]" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }} />
        </label>
      </div>

      <div className="border-t px-5 pb-2 pt-1.5 max-h-[360px] overflow-y-auto" style={{ borderColor: "hsl(var(--muted))" }}>
        {params.map((p) => {
          const val = values[p.id];
          const has = val !== "";
          const st: Status | null = has ? statusFromScore(p.scoreFor(val)) : null;
          const chip = st ? CHIP[st] : null;
          return (
            <div key={p.id} className="grid items-center gap-3 border-b py-2.5" style={{ gridTemplateColumns: "1fr 140px 84px", borderColor: "hsl(var(--muted))" }}>
              <div>
                <div className="text-[13.5px] font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>{p.name_ru}</div>
                {p.input_type !== "enum" && (
                  <div className="mt-0.5 text-[10.5px]" style={{ ...MONO, color: "hsl(var(--muted-foreground))" }}>
                    норма {p.normLo ?? ""}{p.normLo != null && p.normHi != null ? "–" : ""}{p.normHi ?? ""}{p.unit ? ` ${p.unit}` : ""}
                  </div>
                )}
              </div>

              {p.input_type === "enum" ? (
                p.code === "consciousness" ? (
                  <select
                    value={val}
                    onChange={(e) => setVal(p.id, e.target.value)}
                    className="rounded-md border px-2 py-2 text-[13px]"
                    style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                  >
                    <option value="">Выбрать...</option>
                    <option value="alert">A — Ясное</option>
                    <option value="voice">V — Реакция на голос</option>
                    <option value="pain">P — Реакция на боль</option>
                    <option value="unresponsive">U — Без реакции</option>
                    {p.showConfusionOption && <option value="confusion">C — Спутанность</option>}
                  </select>
                ) : p.code === "oxygen" ? (
                  <select
                    value={val}
                    onChange={(e) => setVal(p.id, e.target.value)}
                    className="rounded-md border px-2 py-2 text-[13px]"
                    style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                  >
                    <option value="">Выбрать...</option>
                    <option value="air">Воздух</option>
                    <option value="o2">Кислород</option>
                  </select>
                ) : null
              ) : (
                <div className="flex items-center gap-2 rounded-md border px-2.5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}>
                  <input
                    type="number" inputMode="decimal" value={val}
                    onChange={(e) => setVal(p.id, e.target.value)}
                    step={p.input_type === "numeric" ? "0.1" : "1"}
                    className="w-full bg-transparent py-2.5 text-[17px] font-semibold outline-none"
                    style={{ ...MONO, color: "hsl(var(--foreground))" }}
                  />
                  {p.unit && <span className="whitespace-nowrap text-[11px]" style={{ ...MONO, color: "hsl(var(--muted-foreground))" }}>{p.unit}</span>}
                </div>
              )}

              <div className="justify-self-end">
                {chip && <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: chip.color, background: chip.bg }}>{chip.label}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pt-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>Заметки</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-md border px-2.5 py-2 text-[13px] resize-none"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-4 border-t px-5 py-4 mt-3" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--secondary))" }}>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>Балл ШРПУ</span>
          <div className="flex items-baseline gap-2">
            <span style={{ ...MONO, fontSize: 30, fontWeight: 600, lineHeight: 1, color: s.color }}>{score}</span>
            <span className="text-[13px] font-semibold" style={{ color: s.color }}>{s.label}</span>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={onCancel} disabled={saving} className="rounded-md border px-4 py-2.5 text-[13.5px] font-medium hover:bg-black/5 transition-colors" style={{ borderColor: "#000000", color: "hsl(var(--foreground))", background: "#ffffff" }}>Отмена</button>
          <button
            onClick={() => {
              const out: Record<string, string> = {};
              params.forEach((p) => { if (values[p.id] !== "") out[p.id] = values[p.id]; });
              onSave?.(out, score, notes);
            }}
            disabled={saving || Object.keys(values).every((k) => values[k] === "")}
            className="rounded-md px-4 py-2.5 text-[13.5px] font-semibold disabled:opacity-50"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
