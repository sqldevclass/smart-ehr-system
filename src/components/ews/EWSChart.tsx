import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
  Tooltip,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
} from "recharts";

interface Props {
  hospitalizationId: string;
  parameters: any[];
  thresholds: any[];
  overrideMap: Record<string, any>;
  alertSlot?: React.ReactNode;
}

const LABEL_WIDTH = 110;
const ROW_HEIGHT = 100;
const ENUM_ROW_HEIGHT = 36;
const Y_AXIS_WIDTH = 28;

// Same score -> color mapping as before: 0 = normal, 1 = caution, 2/3 = alert.
const ZONE_FILL: Record<string, string> = {
  white: "#ffffff",
  yellow: "#fef9c3",
  pink: "#fce7f3",
};
const DOT_FILL = { 0: "#ffffff", 1: "#fde047", 2: "#f9a8d4", 3: "#f9a8d4" } as Record<number, string>;
const DOT_STROKE = { 0: "#94a3b8", 1: "#ca8a04", 2: "#be185d", 3: "#be185d" } as Record<number, string>;
const TEXT_COLOR = { 0: "#6b7280", 1: "#92400e", 2: "#9d174d", 3: "#9d174d" } as Record<number, string>;

const ENUM_LABELS: Record<string, string> = {
  alert: "A",
  voice: "V",
  pain: "P",
  unresponsive: "U",
  air: "Возд",
  oxygen: "O₂",
};

const deduplicateTicks = (ticks: number[]) => {
  const sorted = [...ticks].sort((a, b) => a - b);
  const result: number[] = [];
  for (const val of sorted) {
    const near = result.find((v) => Math.abs(v - val) <= 1);
    if (near === undefined) {
      result.push(val);
    } else {
      const idx = result.indexOf(near);
      if (val === Math.round(val) && near !== Math.round(near)) result[idx] = val;
    }
  }
  return result;
};

function CustomDot({ cx, cy, payload }: any) {
  if (cx == null || cy == null) return null;
  const score = payload?.score ?? 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={DOT_FILL[score] ?? "#ffffff"}
      stroke={DOT_STROKE[score] ?? "#94a3b8"}
      strokeWidth={1.5}
    />
  );
}

function RowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded border bg-background px-2 py-1 shadow-md text-xs">
      <div className="font-medium">{p.paramName}</div>
      <div style={{ color: TEXT_COLOR[p.score] ?? "#6b7280" }}>{p.displayValue}</div>
      <div className="text-muted-foreground">{p.timeLabel}</div>
      {p.score > 0 && (
        <div className="font-medium" style={{ color: TEXT_COLOR[p.score] }}>
          +{p.score} балл
        </div>
      )}
    </div>
  );
}

export default function EWSChart({
  hospitalizationId,
  parameters,
  thresholds,
  overrideMap,
  alertSlot,
}: Props) {
  const [timeWindow, setTimeWindow] = useState<"5d" | "all">("all");

  const { data: readings = [] } = useQuery({
    queryKey: ["ews-chart-readings", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_readings")
        .select(`
          id, recorded_at, total_score, escalation_level,
          ews_reading_values(parameter_id, numeric_value, text_value, score)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_voided", false)
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const now = new Date();
  const windowStart =
    timeWindow === "all" ? new Date(0) : new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const filteredReadings = readings.filter(
    (r: any) => new Date(r.recorded_at) >= windowStart,
  );

  const dayGroups = useMemo(() => {
    const groups: { date: string; startIndex: number; count: number }[] = [];
    filteredReadings.forEach((r: any, i: number) => {
      const dt = new Date(r.recorded_at);
      const dateStr = `${dt.getDate().toString().padStart(2, "0")}.${(dt.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      const last = groups[groups.length - 1];
      if (last && last.date === dateStr) last.count++;
      else groups.push({ date: dateStr, startIndex: i, count: 1 });
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReadings]);

  const getYRange = (paramId: string) => {
    const t = thresholds.filter((th: any) => th.parameter_id === paramId);
    const vals = t
      .flatMap((th: any) => [th.min_value, th.max_value])
      .filter((v: any) => v !== null && v !== undefined);
    if (vals.length === 0) return { yMin: 0, yMax: 100 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || 1;
    return { yMin: Math.floor(min - pad), yMax: Math.ceil(max + pad) };
  };

  const timeLabelFor = (idx: number) => {
    const dt = new Date(filteredReadings[idx].recorded_at);
    return `${dt.getHours().toString().padStart(2, "0")}:${dt
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  const numericParams = parameters.filter((p: any) => p.input_type !== "enum");
  const enumParams = parameters.filter((p: any) => p.input_type === "enum");

  const xDomain: [number, number] = [-0.5, Math.max(filteredReadings.length - 1, 0) + 0.5];
  const chartMargin = { top: 8, right: 8, bottom: 4, left: 0 };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {(["5d", "all"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTimeWindow(key)}
            className={cn(
              "px-2 py-0.5 text-xs rounded border",
              timeWindow === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {key === "5d" ? "5д" : "Всё"}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">
          {filteredReadings.length} показаний
        </span>
        {alertSlot && <div className="ml-auto">{alertSlot}</div>}
      </div>

      {filteredReadings.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Нет данных за выбранный период
        </p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          {/* Shared day/time header */}
          <div className="flex border-b bg-muted/40">
            <div style={{ width: LABEL_WIDTH }} className="shrink-0" />
            <div className="flex-1" style={{ paddingLeft: Y_AXIS_WIDTH + chartMargin.left, paddingRight: chartMargin.right }}>
              <div className="flex">
                {dayGroups.map((g, gi) => (
                  <div
                    key={`${g.date}-${gi}`}
                    className="text-[10px] font-medium text-center border-l first:border-l-0 py-0.5"
                    style={{ flex: g.count }}
                  >
                    {g.date}
                  </div>
                ))}
              </div>
              <div className="flex">
                {filteredReadings.map((_r: any, i: number) => (
                  <div
                    key={i}
                    className="text-[9px] text-muted-foreground text-center py-0.5"
                    style={{ flex: 1 }}
                  >
                    {timeLabelFor(i)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* One synchronized row per numeric parameter */}
          {numericParams.map((p: any) => {
            const { yMin, yMax } = getYRange(p.id);
            const paramThresholds = thresholds
              .filter((t: any) => t.parameter_id === p.id)
              .sort(
                (a: any, b: any) => (a.min_value ?? -999999) - (b.min_value ?? -999999),
              );
            const override = overrideMap[p.id];

            const rowData = filteredReadings.map((r: any, i: number) => {
              const val = r.ews_reading_values?.find(
                (v: any) => v.parameter_id === p.id,
              );
              const numeric = val?.numeric_value ?? null;
              return {
                idx: i,
                value: numeric,
                score: val?.score ?? 0,
                paramName: p.name_ru,
                displayValue:
                  numeric === null ? "—" : `${numeric}${p.unit ? ` ${p.unit}` : ""}`,
                timeLabel: new Date(r.recorded_at).toLocaleString("ru"),
              };
            });

            const yTickVals = new Set<number>([yMin, yMax]);
            paramThresholds.forEach((t: any) => {
              if (
                t.min_value !== null &&
                t.min_value !== undefined &&
                t.min_value >= yMin &&
                t.min_value <= yMax
              )
                yTickVals.add(t.min_value);
              if (
                t.max_value !== null &&
                t.max_value !== undefined &&
                t.max_value >= yMin &&
                t.max_value <= yMax
              )
                yTickVals.add(t.max_value);
            });
            const yTicks = deduplicateTicks(Array.from(yTickVals));
            const latest = [...rowData].reverse().find((d) => d.value !== null);

            return (
              <div key={p.id} className="flex border-b last:border-b-0">
                <div
                  style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
                  className="shrink-0 border-r px-2 py-1 flex flex-col justify-center gap-0.5"
                >
                  <span className="text-xs font-medium leading-tight">{p.name_ru}</span>
                  {p.unit && (
                    <span className="text-[10px] text-muted-foreground">{p.unit}</span>
                  )}
                  {latest && (
                    <span
                      className="text-sm font-semibold"
                      style={{ color: TEXT_COLOR[latest.score] ?? "#6b7280" }}
                    >
                      {latest.value}
                    </span>
                  )}
                </div>
                <div className="flex-1" style={{ height: ROW_HEIGHT }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rowData} margin={chartMargin}>
                      {paramThresholds.map((th: any, ti: number) => {
                        const zMin = th.min_value ?? yMin;
                        const zMax = th.max_value ?? yMax;
                        const fill =
                          th.score === 0 && override
                            ? "#ffffff"
                            : ZONE_FILL[th.color] ?? "#ffffff";
                        return (
                          <ReferenceArea
                            key={ti}
                            y1={zMin}
                            y2={zMax}
                            fill={fill}
                            fillOpacity={1}
                            stroke="none"
                            ifOverflow="hidden"
                          />
                        );
                      })}
                      <XAxis
                        dataKey="idx"
                        type="number"
                        domain={xDomain}
                        hide
                      />
                      <YAxis
                        type="number"
                        domain={[yMin, yMax]}
                        ticks={yTicks}
                        tickFormatter={(v: number) =>
                          v % 1 === 0 ? String(v) : v.toFixed(1)
                        }
                        tickLine={false}
                        axisLine={false}
                        width={Y_AXIS_WIDTH}
                        fontSize={9}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip content={<RowTooltip />} />
                      <Line
                        type="linear"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={1.5}
                        dot={<CustomDot />}
                        activeDot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}

          {/* Enum parameters (e.g. AVPU consciousness) as letter markers */}
          {enumParams.map((p: any) => {
            const rowData = filteredReadings
              .map((r: any, i: number) => {
                const val = r.ews_reading_values?.find(
                  (v: any) => v.parameter_id === p.id,
                );
                if (!val?.text_value) return null;
                return {
                  idx: i,
                  y: 0,
                  label: ENUM_LABELS[val.text_value] ?? val.text_value,
                  score: val.score ?? 0,
                };
              })
              .filter(Boolean) as any[];

            return (
              <div key={p.id} className="flex border-b last:border-b-0">
                <div
                  style={{ width: LABEL_WIDTH, height: ENUM_ROW_HEIGHT }}
                  className="shrink-0 border-r px-2 flex items-center"
                >
                  <span className="text-xs font-medium leading-tight">{p.name_ru}</span>
                </div>
                <div className="flex-1" style={{ height: ENUM_ROW_HEIGHT }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={chartMargin}>
                      <XAxis
                        dataKey="idx"
                        type="number"
                        domain={xDomain}
                        hide
                      />
                      <YAxis
                        dataKey="y"
                        type="number"
                        domain={[-1, 1]}
                        width={Y_AXIS_WIDTH}
                        hide
                      />
                      <Scatter
                        data={rowData}
                        isAnimationActive={false}
                        shape={(props: any) => (
                          <text
                            x={props.cx}
                            y={props.cy}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={11}
                            fontWeight={600}
                            fill={TEXT_COLOR[props.payload.score] ?? "#6b7280"}
                          >
                            {props.payload.label}
                          </text>
                        )}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
