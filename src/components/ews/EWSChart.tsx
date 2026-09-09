/* ============================================================================
   EWSChart — merged from the "Direction A" design upload + this app's
   existing behavior. Raw SVG (no charting library), banded rows, smooth
   Catmull-Rom trend curve, hero score header with sparkline.

   Preserved from the app's existing implementation (not in the original
   upload): overrideMap threading into zone bands, enum-parameter rows
   (AVPU consciousness / oxygen delivery letter markers) in the historical
   chart, and this app's own tooltip content/styling.

   Same Props + same Supabase query as before — drop-in for EWSSection.
   ============================================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ---- geometry ---- */
const MARGIN_LEFT = 178;
const ROW_HEIGHT = 116;
const ENUM_ROW_HEIGHT = 40;
const PADDING_TOP = 22;
const PADDING_BOTTOM = 18;
const PADDING_X = 16;
const X_AXIS_HEIGHT = 48;
const chartArea = ROW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

/* ---- zone-band colors (this app's richer amber/rose, not the upload's
   pale versions) -- 3 tiers keyed by the DB's threshold color, not
   collapsed to a 2-tier normal/alert split. ---- */
const ZONE_FILL: Record<string, string> = {
  white: "#fbfcfd",
  yellow: "#fde68a",
  pink: "#fca5a5",
};
const EDGE_NORMAL = "#E6C200";
const GRAPHITE = "#4B5563";

/* ---- point/text colors: per this session's decision -- keep the
   uploaded file's specific hex values for amber/red. ---- */
const PT = {
  normal: { stroke: GRAPHITE, fill: "#ffffff", text: "#6B7280" },
  amber: { stroke: "#C2410C", fill: "#ffffff", dot: "#C2410C", text: "#C2410C" },
  red: { stroke: "#DC2626", fill: "#ffffff", dot: "#DC2626", text: "#DC2626" },
} as const;

type Sev = "low" | "watch" | "mid" | "high";
const SEV: Record<Sev, { label: string; color: string; bg: string }> = {
  low: { label: "Низкий риск", color: "#15803D", bg: "#F0FDF4" },
  watch: { label: "Под наблюдением", color: "#A16207", bg: "#FEFCE8" },
  mid: { label: "Средний риск", color: "#C2410C", bg: "#FFF7ED" },
  high: { label: "Высокий риск", color: "#DC2626", bg: "#FEF2F2" },
};
const severityOf = (score: number): Sev =>
  score >= 7 ? "high" : score >= 4 ? "mid" : score >= 1 ? "watch" : "low";

const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums",
};

const ENUM_LABELS: Record<string, string> = {
  alert: "A", voice: "V", pain: "P", unresponsive: "U", air: "Возд", oxygen: "O₂", o2: "O₂",
};

const statusFromScore = (s: number) => (s >= 2 ? "red" : s === 1 ? "amber" : "normal");
const fmt = (v: number) => (v % 1 === 0 ? `${v}` : v.toFixed(1));

/* Catmull-Rom -> cubic bezier smoothing through all points (no gaps to
   worry about since `pts` is already filtered to non-null values before
   this runs, same effect as connectNulls). */
const smoothPath = (points: { x: number; y: number }[]) => {
  if (points.length < 2) return "";
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
};

interface Props {
  hospitalizationId: string;
  parameters: any[];
  thresholds: any[];
  overrideMap: Record<string, any>;
  alertSlot?: React.ReactNode;
}

/* ============================================================================
   PewsScoreHeader — hero score card + sparkline.
   ============================================================================ */
export function PewsScoreHeader({
  readings,
  scaleLabel = "PEWS 5–11 лет",
  interval = "непрерывный мониторинг",
  nextDue,
  onEditThresholds,
  onEnterData,
}: {
  readings: { total_score: number }[];
  scaleLabel?: string;
  interval?: string;
  nextDue?: string;
  onEditThresholds?: () => void;
  onEnterData?: () => void;
}) {
  const scores = readings.map((r) => r.total_score ?? 0);
  const current = scores.length ? scores[scores.length - 1] : 0;
  const sev = severityOf(current);
  const s = SEV[sev];

  const w = 132, hh = 40, max = Math.max(7, ...scores, 1), n = Math.max(scores.length, 2);
  const px = (i: number) => 3 + (i * (w - 6)) / (n - 1);
  const py = (v: number) => hh - 4 - (v / max) * (hh - 10);
  const line = scores.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `3,${hh - 4} ${line} ${w - 3},${hh - 4}`;

  return (
    <div className="flex items-center gap-7 rounded-lg border bg-card px-6 py-4" style={{ borderColor: "hsl(var(--border))", boxShadow: "var(--shadow-card)" }}>
      <div
        className="grid items-center gap-x-4 rounded-xl px-4 py-3"
        style={{ gridTemplateColumns: "auto auto auto", background: s.bg, border: `1px solid ${s.color}33` }}
      >
        <div className="row-span-2 flex items-baseline">
          <span style={{ ...MONO, fontSize: 46, fontWeight: 600, lineHeight: 0.9, color: s.color, letterSpacing: "-0.02em" }}>
            {current}
          </span>
        </div>
        <div className="self-center">
          <div className="text-[11px] uppercase tracking-wide" style={{ color: "hsl(var(--muted-foreground))" }}>Балл ШРПУ</div>
          <div className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</div>
        </div>
        <div className="row-span-2 self-center">
          <svg width={w} height={hh} viewBox={`0 0 ${w} ${hh}`} style={{ display: "block" }}>
            <polygon points={area} fill={s.color} fillOpacity={0.1} />
            <polyline points={line} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" />
            <circle cx={px(n - 1)} cy={py(scores[scores.length - 1] ?? 0)} r={2.8} fill={s.color} />
          </svg>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="font-heading text-lg font-bold tracking-wide" style={{ color: "hsl(var(--foreground))" }}>ШРПУ</div>
        <div className="mb-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>Шкала · {scaleLabel}</div>
        <div className="flex flex-col gap-0.5 text-[13px]">
          <div className="flex gap-2.5"><span style={{ color: "hsl(var(--muted-foreground))", minWidth: 152 }}>Интервал</span><span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{interval}</span></div>
          <div className="flex gap-2.5"><span style={{ color: "hsl(var(--muted-foreground))", minWidth: 152 }}>Следующее внесение</span><span className="font-medium" style={{ ...MONO, fontSize: 12.5, color: "hsl(var(--foreground))" }}>{nextDue ?? "—"}</span></div>
        </div>
      </div>

      {(onEditThresholds || onEnterData) && (
        <div className="ml-auto flex items-center gap-2">
          {onEditThresholds && (
            <button onClick={onEditThresholds} className="rounded-md border px-4 py-2.5 text-[13.5px] font-medium hover:bg-black/5 transition-colors" style={{ borderColor: "#000000", color: "hsl(var(--foreground))", background: "#ffffff" }}>
              Изменить границы нормы
            </button>
          )}
          {onEnterData && (
            <button onClick={onEnterData} className="rounded-md px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
              + Внести данные
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   PewsChart — banded rows + smooth trend line + enum marker rows.
   ============================================================================ */
export function PewsChart({
  parameters,
  thresholds,
  overrideMap,
  readings,
  alertSlot,
}: {
  parameters: any[];
  thresholds: any[];
  overrideMap: Record<string, any>;
  readings: any[];
  alertSlot?: React.ReactNode;
}) {
  const [timeWindow, setTimeWindow] = useState<"5d" | "all">("all");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; paramName: string; value: string; time: string; score: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(900);

  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setContainerWidth((prev) => (Math.abs(prev - w) > 10 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const now = Date.now();
  const windowStart = timeWindow === "all" ? 0 : now - 5 * 24 * 3600 * 1000;
  const filtered = readings.filter((r) => new Date(r.recorded_at).getTime() >= windowStart);

  const chartWidth = Math.max(containerWidth - MARGIN_LEFT, 200);
  const n = filtered.length;
  const cellWidth = n > 1 ? (chartWidth - 2 * PADDING_X) / (n - 1) : chartWidth / 2;
  const xScale = (i: number) => (n <= 1 ? chartWidth / 2 : PADDING_X + i * cellWidth);

  const dayGroups = useMemo(() => {
    const groups: { date: string; startIndex: number; count: number }[] = [];
    filtered.forEach((r, i) => {
      const dt = new Date(r.recorded_at);
      const dateStr = `${`${dt.getDate()}`.padStart(2, "0")}.${`${dt.getMonth() + 1}`.padStart(2, "0")}`;
      const last = groups[groups.length - 1];
      if (last && last.date === dateStr) last.count++;
      else groups.push({ date: dateStr, startIndex: i, count: 1 });
    });
    return groups;
  }, [filtered]);

  const getYRange = (paramId: string) => {
    const t = thresholds.filter((th) => th.parameter_id === paramId);
    const vals = t.flatMap((th) => [th.min_value, th.max_value]).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return { yMin: 0, yMax: 100 };
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.12 || 1;
    return { yMin: Math.floor(min - pad), yMax: Math.ceil(max + pad) };
  };
  const yScale = (value: number, yMin: number, yMax: number) => {
    const range = yMax - yMin || 1;
    const raw = PADDING_TOP + chartArea - ((value - yMin) / range) * chartArea;
    return Math.max(PADDING_TOP, Math.min(ROW_HEIGHT - PADDING_BOTTOM, raw));
  };

  const numericParams = parameters.filter((p) => p.input_type !== "enum");
  const enumParams = parameters.filter((p) => p.input_type === "enum");

  return (
    <div ref={containerRef}>
      <div className="mb-3 flex items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted))" }}>
          {(["5d", "all"] as const).map((key, i) => (
            <button
              key={key}
              onClick={() => setTimeWindow(key)}
              className="rounded px-3 py-1 text-[13px] font-medium"
              style={timeWindow === key
                ? { background: "hsl(var(--card))", color: "hsl(var(--foreground))", boxShadow: "0 1px 2px hsl(0 0% 0% / 0.08)" }
                : { background: "transparent", color: "hsl(var(--muted-foreground))" }}
            >
              {["5 дней", "Всё"][i]}
            </button>
          ))}
        </div>
        <span className="text-[12.5px]" style={{ ...MONO, color: "hsl(var(--muted-foreground))" }}>{n} показаний</span>
        {alertSlot && <div className="ml-auto">{alertSlot}</div>}
      </div>

      {n === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Нет данных за выбранный период</p>
      ) : (
        <div ref={scrollRef} className="relative overflow-x-auto rounded-lg border" style={{ borderColor: "hsl(var(--border))" }}>
          {tooltip && (
            <div
              className="pointer-events-none absolute z-50 rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-lg"
              style={{
                left: tooltip.x + MARGIN_LEFT + 8,
                top: tooltip.y - 44,
                transform: "translateX(-50%)",
                borderColor: "hsl(var(--border))",
                transition: "left 100ms ease-out, top 100ms ease-out",
              }}
            >
              <div className="font-medium text-foreground">{tooltip.paramName}</div>
              <div style={MONO}>{tooltip.value}</div>
              <div className="text-muted-foreground">{tooltip.time}</div>
              {tooltip.score > 0 && (
                <div className="mt-0.5 font-semibold" style={{ color: tooltip.score === 1 ? PT.amber.text : PT.red.text }}>+{tooltip.score} балл</div>
              )}
            </div>
          )}

          <div style={{ width: MARGIN_LEFT + chartWidth }}>
            {/* sticky time axis */}
            <div className="sticky top-0 z-10 flex border-b" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}>
              <div style={{ width: MARGIN_LEFT }} className="shrink-0" />
              <svg width={chartWidth} height={X_AXIS_HEIGHT} className="overflow-visible">
                {dayGroups.map((group, gi) => {
                  const startX = xScale(group.startIndex);
                  const labelX = startX + ((group.count - 1) * cellWidth) / 2;
                  return (
                    <g key={gi}>
                      <text x={labelX} y={14} textAnchor="middle" fontSize={11} fontWeight={600} fill="hsl(var(--muted-foreground))">{group.date}</text>
                      {gi > 0 && <line x1={startX - cellWidth / 2} y1={0} x2={startX - cellWidth / 2} y2={X_AXIS_HEIGHT} stroke="hsl(var(--border))" strokeWidth={1} />}
                    </g>
                  );
                })}
                {filtered.map((r, i) => {
                  const x = xScale(i);
                  const dt = new Date(r.recorded_at);
                  const label = `${`${dt.getHours()}`.padStart(2, "0")}:${`${dt.getMinutes()}`.padStart(2, "0")}`;
                  const skip = Math.max(1, Math.ceil(34 / Math.max(cellWidth, 1)));
                  const show = cellWidth >= 34 || i === 0 || i === n - 1 || i % skip === 0;
                  return show ? <text key={r.id ?? i} x={x} y={38} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))" style={MONO}>{label}</text> : null;
                })}
              </svg>
            </div>

            {/* numeric parameter rows */}
            {numericParams.map((p) => {
              const { yMin, yMax } = getYRange(p.id);
              const bands = thresholds.filter((t) => t.parameter_id === p.id);
              const normal = bands.find((b) => b.score === 0);
              const normLo = normal?.min_value, normHi = normal?.max_value;
              const override = overrideMap[p.id];

              const pts = filtered
                .map((r, i) => {
                  const val = r.ews_reading_values?.find((v: any) => v.parameter_id === p.id);
                  if (val?.numeric_value === null || val?.numeric_value === undefined) return null;
                  return { x: xScale(i), y: yScale(val.numeric_value, yMin, yMax), value: val.numeric_value as number, score: val.score as number, recorded_at: r.recorded_at, isLast: i === n - 1, origIndex: i };
                })
                .filter(Boolean) as any[];

              const linePath = smoothPath(pts.map((pt) => ({ x: pt.x, y: pt.y })));
              const latest = pts[pts.length - 1];
              const latestStatus = latest ? statusFromScore(latest.score) : "normal";

              return (
                <div key={p.id} className="flex border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  <div style={{ width: MARGIN_LEFT, height: ROW_HEIGHT }} className="shrink-0 flex flex-col justify-center gap-0.5 border-r px-4">
                    <div className="text-[13.5px] font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>{p.name_ru}</div>
                    {p.unit && <div className="text-[11px]" style={{ ...MONO, color: "hsl(var(--muted-foreground))" }}>{p.unit}</div>}
                    {latest && (
                      <div className="mt-1.5 text-[24px] font-semibold leading-none" style={{ ...MONO, color: PT[latestStatus].text, letterSpacing: "-0.01em" }}>{fmt(latest.value)}</div>
                    )}
                    {(normLo != null || normHi != null) && (
                      <div className="mt-1 text-[11px]" style={{ ...MONO, color: "hsl(var(--muted-foreground))" }}>
                        <span style={{ opacity: 0.7 }}>норма </span>{normLo ?? ""}{normLo != null && normHi != null ? "–" : ""}{normHi ?? ""}
                      </div>
                    )}
                  </div>

                  <svg width={chartWidth} height={ROW_HEIGHT}>
                    <defs><clipPath id={`pews-clip-${p.id}`}><rect x={0} y={0} width={chartWidth} height={ROW_HEIGHT} /></clipPath></defs>
                    <g clipPath={`url(#pews-clip-${p.id})`}>
                      {bands.map((b, bi) => {
                        const zMin = b.min_value ?? yMin, zMax = b.max_value ?? yMax;
                        const rectY = yScale(Math.min(zMax, yMax), yMin, yMax);
                        const rectH = yScale(Math.max(zMin, yMin), yMin, yMax) - rectY;
                        const fill = b.score === 0 && override ? ZONE_FILL.white : ZONE_FILL[b.color] ?? ZONE_FILL.white;
                        return <rect key={bi} x={0} y={rectY} width={chartWidth} height={Math.max(rectH, 0)} fill={fill} />;
                      })}
                      {[normLo, normHi].map((lim, li) =>
                        lim != null && lim > yMin && lim < yMax ? (
                          <line key={li} x1={0} y1={yScale(lim, yMin, yMax)} x2={chartWidth} y2={yScale(lim, yMin, yMax)} stroke={EDGE_NORMAL} strokeWidth={1} strokeDasharray="1 4" strokeLinecap="round" opacity={0.85} />
                        ) : null
                      )}
                      {filtered.map((_, i) => <line key={i} x1={xScale(i)} y1={2} x2={xScale(i)} y2={ROW_HEIGHT - 2} stroke="hsl(var(--border))" strokeWidth={1} opacity={0.45} />)}
                      {pts.length > 1 && <path d={linePath} fill="none" stroke={GRAPHITE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />}
                      {pts.map((pt, di) => {
                        const st = statusFromScore(pt.score) as keyof typeof PT;
                        const out = st !== "normal";
                        const above = pt.y > PADDING_TOP + 16;
                        const labelY = above ? pt.y - 10 : pt.y + 16;
                        return (
                          <g key={di} pointerEvents="none">
                            {pt.isLast && out && <circle cx={pt.x} cy={pt.y} r={10} fill={PT[st].stroke} fillOpacity={0.14} />}
                            <circle
                              cx={pt.x} cy={pt.y} r={out ? 5.2 : 3.6}
                              fill={PT[st].fill} stroke={PT[st].stroke} strokeWidth={out ? 2.2 : 1.7}
                            />
                            {out && <circle cx={pt.x} cy={pt.y} r={1.7} fill={(PT[st] as any).dot} />}
                            <text x={pt.x} y={labelY} textAnchor="middle" fontSize={10.5} fontWeight={out ? 600 : 500} fill={PT[st].text} style={MONO}>{fmt(pt.value)}</text>
                          </g>
                        );
                      })}
                      <rect
                        x={0} y={0} width={chartWidth} height={ROW_HEIGHT}
                        fill="transparent"
                        onMouseMove={(e) => {
                          const svg = (e.currentTarget as SVGRectElement).ownerSVGElement!;
                          const rect = svg.getBoundingClientRect();
                          const localX = e.clientX - rect.left;
                          const idx = Math.max(0, Math.min(n - 1, Math.round((localX - PADDING_X) / Math.max(cellWidth, 1))));
                          const match = pts.find((pt: any) => pt.origIndex === idx);
                          if (match && scrollRef.current) {
                            const outerRect = scrollRef.current.getBoundingClientRect();
                            const rowTop = rect.top - outerRect.top + scrollRef.current.scrollTop;
                            setTooltip({ x: match.x, y: rowTop + match.y, paramName: p.name_ru, value: `${fmt(match.value)}${p.unit ? ` ${p.unit}` : ""}`, time: new Date(match.recorded_at).toLocaleString("ru"), score: match.score });
                          } else {
                            setTooltip(null);
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    </g>
                  </svg>
                </div>
              );
            })}

            {/* enum parameter rows (AVPU consciousness / oxygen delivery) --
               kept from this app's existing behavior; the upload dropped these. */}
            {enumParams.map((p) => {
              const rowPts = filtered
                .map((r, i) => {
                  const val = r.ews_reading_values?.find((v: any) => v.parameter_id === p.id);
                  if (!val?.text_value) return null;
                  return { x: xScale(i), label: ENUM_LABELS[val.text_value] ?? val.text_value, score: val.score ?? 0, recorded_at: r.recorded_at, value: val.text_value, origIndex: i };
                })
                .filter(Boolean) as any[];

              return (
                <div key={p.id} className="flex border-b" style={{ borderColor: "hsl(var(--border))" }}>
                  <div style={{ width: MARGIN_LEFT, height: ENUM_ROW_HEIGHT }} className="shrink-0 flex items-center border-r px-4">
                    <span className="text-[13.5px] font-semibold leading-tight" style={{ color: "hsl(var(--foreground))" }}>{p.name_ru}</span>
                  </div>
                  <svg width={chartWidth} height={ENUM_ROW_HEIGHT}>
                    {filtered.map((_, i) => <line key={i} x1={xScale(i)} y1={2} x2={xScale(i)} y2={ENUM_ROW_HEIGHT - 2} stroke="hsl(var(--border))" strokeWidth={1} opacity={0.3} />)}
                    {rowPts.map((pt, di) => {
                      const st = statusFromScore(pt.score) as keyof typeof PT;
                      return (
                        <text
                          key={di}
                          x={pt.x}
                          y={ENUM_ROW_HEIGHT / 2 + 4}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={600}
                          fill={PT[st].text}
                          pointerEvents="none"
                        >
                          {pt.label}
                        </text>
                      );
                    })}
                    <rect
                      x={0} y={0} width={chartWidth} height={ENUM_ROW_HEIGHT}
                      fill="transparent"
                      onMouseMove={(e) => {
                        const svg = (e.currentTarget as SVGRectElement).ownerSVGElement!;
                        const rect = svg.getBoundingClientRect();
                        const localX = e.clientX - rect.left;
                        const idx = Math.max(0, Math.min(n - 1, Math.round((localX - PADDING_X) / Math.max(cellWidth, 1))));
                        const match = rowPts.find((pt: any) => pt.origIndex === idx);
                        if (match && scrollRef.current) {
                          const outerRect = scrollRef.current.getBoundingClientRect();
                          const rowTop = rect.top - outerRect.top + scrollRef.current.scrollTop;
                          setTooltip({ x: match.x, y: rowTop + ENUM_ROW_HEIGHT / 2, paramName: p.name_ru, value: match.label, time: new Date(match.recorded_at).toLocaleString("ru"), score: match.score });
                        } else {
                          setTooltip(null);
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   EWSChart (default) — same Props + same query as before. Drop-in.
   ============================================================================ */
export default function EWSChart({ hospitalizationId, parameters, thresholds, overrideMap, alertSlot }: Props) {
  const { data: readings = [] } = useQuery({
    queryKey: ["ews-chart-readings", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_readings")
        .select(`id, recorded_at, total_score, escalation_level, ews_reading_values(parameter_id, numeric_value, text_value, score)`)
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_voided", false)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  return <PewsChart parameters={parameters} thresholds={thresholds} overrideMap={overrideMap} readings={readings} alertSlot={alertSlot} />;
}
