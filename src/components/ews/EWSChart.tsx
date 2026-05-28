import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  hospitalId: string;
  scaleId: string | undefined;
  parameters: any[];
  thresholds: any[];
  overrideMap: Record<string, any>;
}

const MARGIN_LEFT = 110;
const ROW_HEIGHT = 100;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;
const PADDING_X = 24;
const chartHeight = ROW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const zoneFill: Record<string, string> = {
  white: "#ffffff",
  yellow: "#fef08a",
  pink: "#fbcfe8",
};
const zoneFillOverride = "#eff6ff";

const LINE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

export default function EWSChart({
  hospitalizationId,
  parameters,
  thresholds,
  overrideMap,
}: Props) {
  const [timeWindow, setTimeWindow] = useState<"1d" | "3d" | "5d" | "7d" | "all">("5d");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    value: string;
    time: string;
    score: number;
    paramName: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

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
    timeWindow === "all"
      ? new Date(0)
      : new Date(
          now.getTime() -
            (timeWindow === "1d"
              ? 1
              : timeWindow === "3d"
              ? 3
              : timeWindow === "5d"
              ? 5
              : 7) *
              24 *
              60 *
              60 *
              1000,
        );
  const filteredReadings = readings.filter(
    (r: any) => new Date(r.recorded_at) >= windowStart,
  );

  const chartWidth = Math.max(
    containerWidth - MARGIN_LEFT,
    200,
  );

  const cellWidth =
    filteredReadings.length > 1
      ? (chartWidth - 2 * PADDING_X) / (filteredReadings.length - 1)
      : chartWidth / 2;
  const xScale = (index: number) =>
    filteredReadings.length <= 1
      ? chartWidth / 2
      : PADDING_X + index * cellWidth;

  const dayGroups = useMemo(() => {
    const groups: { date: string; startIndex: number; count: number }[] = [];
    filteredReadings.forEach((r: any, i: number) => {
      const dt = new Date(r.recorded_at);
      const dateStr =
        `${dt.getDate().toString().padStart(2, "0")}.` +
        `${(dt.getMonth() + 1).toString().padStart(2, "0")}`;
      const last = groups[groups.length - 1];
      if (last && last.date === dateStr) {
        last.count++;
      } else {
        groups.push({ date: dateStr, startIndex: i, count: 1 });
      }
    });
    return groups;
  }, [filteredReadings]);

  const LEVEL1_HEIGHT = 20;
  const X_AXIS_HEIGHT = 48;

  const yScale = (value: number, yMin: number, yMax: number) => {
    const range = yMax - yMin || 1;
    const raw = PADDING_TOP + chartHeight - ((value - yMin) / range) * chartHeight;
    return Math.max(PADDING_TOP, Math.min(ROW_HEIGHT - PADDING_BOTTOM, raw));
  };

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

  return (
    <div className="space-y-0" ref={containerRef}>
      <div className="flex items-center gap-1 mb-3">
        {(["1д", "3д", "5д", "7д", "Всё"] as const).map((w, i) => {
          const key = (["1d", "3d", "5d", "7d", "all"] as const)[i];
          return (
            <button
              key={w}
              onClick={() => setTimeWindow(key)}
              className={cn(
                "px-2 py-0.5 text-xs rounded border",
                timeWindow === key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-muted-foreground border-gray-200 hover:bg-muted",
              )}
            >
              {w}
            </button>
          );
        })}
        <span className="text-xs text-muted-foreground ml-2">
          {filteredReadings.length} показаний
        </span>
      </div>

      {filteredReadings.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Нет данных за выбранный период
        </p>
      ) : (
        <div
          className="overflow-x-auto border rounded-lg relative"
          style={{ borderColor: "#1607eb" }}
        >
          {tooltip && (
            <div
              className="absolute z-50 bg-gray-900 text-white text-xs rounded px-2 py-1.5 pointer-events-none shadow-lg"
              style={{
                left: tooltip.x + MARGIN_LEFT + 8,
                top: tooltip.y - 40,
                transform: "translateX(-50%)",
              }}
            >
              <div className="font-medium">{tooltip.paramName}</div>
              <div>{tooltip.value}</div>
              <div className="text-gray-300">{tooltip.time}</div>
              {tooltip.score > 0 && (
                <div
                  className={cn(
                    "mt-0.5 font-bold",
                    tooltip.score === 1 ? "text-yellow-300" : "text-pink-300",
                  )}
                >
                  +{tooltip.score} балл
                </div>
              )}
            </div>
          )}
          <div style={{ width: MARGIN_LEFT + chartWidth }}>
            <div className="flex sticky top-0 bg-white z-10 border-b-2 border-gray-300">
              <div style={{ width: MARGIN_LEFT }} className="shrink-0" />
              <svg width={chartWidth} height={X_AXIS_HEIGHT} className="overflow-visible">
                {dayGroups.map((group, gi) => {
                  const startX = xScale(group.startIndex);
                  const lastIdx = group.startIndex + group.count - 1;
                  const endX =
                    lastIdx < filteredReadings.length - 1
                      ? xScale(lastIdx) + cellWidth / 2
                      : chartWidth;
                  const groupWidth = endX - (startX - cellWidth / 2);
                  const labelX = startX + ((group.count - 1) * cellWidth) / 2;
                  return (
                    <g key={gi}>
                      <rect
                        x={startX - cellWidth / 2}
                        y={0}
                        width={groupWidth}
                        height={LEVEL1_HEIGHT}
                        fill={gi % 2 === 0 ? "#f9fafb" : "#ffffff"}
                      />
                      <text
                        x={labelX}
                        y={14}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill="#374151"
                      >
                        {group.date}
                      </text>
                      {gi > 0 && (
                        <line
                          x1={startX - cellWidth / 2}
                          y1={0}
                          x2={startX - cellWidth / 2}
                          y2={X_AXIS_HEIGHT}
                          stroke="#e5e7eb"
                          strokeWidth={1}
                        />
                      )}
                    </g>
                  );
                })}
                <line
                  x1={0}
                  y1={LEVEL1_HEIGHT}
                  x2={chartWidth}
                  y2={LEVEL1_HEIGHT}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
                {filteredReadings.map((r: any, i: number) => {
                  const x = xScale(i);
                  const dt = new Date(r.recorded_at);
                  const label =
                    `${dt.getHours().toString().padStart(2, "0")}:` +
                    `${dt.getMinutes().toString().padStart(2, "0")}`;
                  const skip = Math.max(1, Math.ceil(28 / Math.max(cellWidth, 1)));
                  const showLabel =
                    cellWidth >= 28 ||
                    i === 0 ||
                    i === filteredReadings.length - 1 ||
                    i % skip === 0;
                  return (
                    <g key={r.id}>
                      <line
                        x1={x}
                        y1={LEVEL1_HEIGHT}
                        x2={x}
                        y2={LEVEL1_HEIGHT + 4}
                        stroke="#9ca3af"
                        strokeWidth={1}
                      />
                      {showLabel && (
                        <text
                          x={x}
                          y={LEVEL1_HEIGHT + 16}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#6b7280"
                        >
                          {label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {parameters
              .filter((p: any) => p.input_type !== "enum")
              .map((p: any, paramIdx: number) => {
                const { yMin, yMax } = getYRange(p.id);
                const paramThresholds = thresholds
                  .filter((t: any) => t.parameter_id === p.id)
                  .sort(
                    (a: any, b: any) =>
                      (a.min_value ?? -999999) - (b.min_value ?? -999999),
                  );

                const paramReadings = filteredReadings
                  .map((r: any, i: number) => {
                    const val = r.ews_reading_values?.find(
                      (v: any) => v.parameter_id === p.id,
                    );
                    if (val?.numeric_value === null || val?.numeric_value === undefined)
                      return null;
                    return {
                      x: xScale(i),
                      y: yScale(val.numeric_value, yMin, yMax),
                      value: val.numeric_value,
                      score: val.score,
                      time: new Date(r.recorded_at).toLocaleString("ru"),
                      recorded_at: r.recorded_at,
                      readingIndex: i,
                    };
                  })
                  .filter(Boolean) as any[];

                const linePath = paramReadings
                  .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
                  .join(" ");

                const latest = paramReadings[paramReadings.length - 1];
                const override = overrideMap[p.id];

                const yTickVals = new Set<number>();
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
                yTickVals.add(yMin);
                yTickVals.add(yMax);
                const rawYTicks = Array.from(yTickVals);
                const deduplicateTicks = (ticks: number[]) => {
                  const sorted = [...ticks].sort((a, b) => a - b);
                  const result: number[] = [];
                  for (const val of sorted) {
                    const near = result.find((v) => Math.abs(v - val) <= 1);
                    if (near === undefined) {
                      result.push(val);
                    } else {
                      const idx = result.indexOf(near);
                      if (
                        val === Math.round(val) &&
                        near !== Math.round(near)
                      ) {
                        result[idx] = val;
                      }
                    }
                  }
                  return result;
                };
                const yTicks = deduplicateTicks(rawYTicks);

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex border border-[#0c0480] relative",
                    )}
                  >
                    <div
                      style={{ width: MARGIN_LEFT, height: ROW_HEIGHT, position: "relative" }}
                      className="shrink-0 flex flex-col items-start justify-between pl-2 py-2 border-r border-[#424543] bg-white overflow-hidden"
                    >
                      <span className="text-xs font-medium text-gray-700 leading-tight text-left break-words hyphens-auto max-w-full pr-7">
                        {p.name_ru}
                      </span>
                      {p.unit && (
                        <span className="text-xs text-muted-foreground pr-7">
                          {p.unit}
                        </span>
                      )}
                      {latest && (
                        <span
                          className={cn(
                            "text-xs font-bold pr-7",
                            latest.score === 0
                              ? "text-gray-700"
                              : latest.score === 1
                              ? "text-yellow-600"
                              : "text-pink-600",
                          )}
                        >
                          {latest.value}
                        </span>
                      )}
                      <div
                        style={{
                          position: "absolute",
                          right: 2,
                          top: 0,
                          bottom: 0,
                          width: 28,
                          pointerEvents: "none",
                        }}
                      >
                        {yTicks.map((tick: number) => {
                          const y = yScale(tick, yMin, yMax);
                          if (y < 4 || y > ROW_HEIGHT - 4) return null;
                          return (
                            <div
                              key={tick}
                              style={{
                                position: "absolute",
                                top: y - 6,
                                right: 0,
                                lineHeight: "1",
                              }}
                              className="text-right"
                            >
                              <span
                                style={{
                                  fontSize: "8px",
                                  color: "#9ca3af",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {tick % 1 === 0 ? tick : tick.toFixed(1)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>


                    {(() => {
                      const lineColor =
                        LINE_COLORS[paramIdx % LINE_COLORS.length];
                      return (
                    <svg
                      width={chartWidth}
                      height={ROW_HEIGHT}
                    >
                      <defs>
                        <clipPath id={`ews-clip-${p.id}`}>
                          <rect
                            x={0}
                            y={0}
                            width={chartWidth}
                            height={ROW_HEIGHT}
                          />
                        </clipPath>
                      </defs>

                      <g clipPath={`url(#ews-clip-${p.id})`}>
                        {paramThresholds.map((th: any, ti: number) => {
                          const zMin = th.min_value ?? yMin;
                          const zMax = th.max_value ?? yMax;
                          const rectY = yScale(Math.min(zMax, yMax), yMin, yMax);
                          const rectH =
                            yScale(Math.max(zMin, yMin), yMin, yMax) - rectY;
                          const fill =
                            th.score === 0 && override
                              ? zoneFillOverride
                              : zoneFill[th.color as keyof typeof zoneFill] ??
                                "#ffffff";
                          return (
                            <rect
                              key={ti}
                              x={0}
                              y={rectY}
                              width={chartWidth}
                              height={Math.max(rectH, 0)}
                              fill={fill}
                            />
                          );
                        })}
                        {yTicks.map((tick: number) => {
                          const y = yScale(tick, yMin, yMax);
                          return (
                            <line
                              key={`hgrid-${tick}`}
                              x1={0}
                              y1={y}
                              x2={chartWidth}
                              y2={y}
                              stroke="#424543"
                              strokeWidth={0.5}
                              strokeOpacity={0.3}
                            />
                          );
                        })}
                        {filteredReadings.map((_: any, i: number) => {
                          const x = xScale(i);
                          return (
                            <line
                              key={`vread-${i}`}
                              x1={x}
                              y1={0}
                              x2={x}
                              y2={ROW_HEIGHT}
                              stroke="#424543"
                              strokeWidth={0.5}
                              strokeOpacity={0.3}
                            />
                          );
                        })}

                        {paramReadings.length > 1 && (
                          <path
                            d={linePath}
                            fill="none"
                            stroke={lineColor}
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        )}
                        {paramReadings.map((pt, di) => (
                          <circle
                            key={di}
                            cx={pt.x}
                            cy={pt.y}
                            r={5}
                            fill={
                              pt.score === 0
                                ? "#ffffff"
                                : pt.score === 1
                                ? "#fde047"
                                : "#f9a8d4"
                            }
                            stroke={
                              pt.score === 0
                                ? lineColor
                                : pt.score === 1
                                ? "#ca8a04"
                                : "#be185d"
                            }
                            strokeWidth={2}
                            className="cursor-pointer"
                            onMouseEnter={() => {
                              setTooltip({
                                x: pt.x,
                                y: pt.y + paramIdx * ROW_HEIGHT + X_AXIS_HEIGHT,
                                value:
                                  `${pt.value}` + (p.unit ? ` ${p.unit}` : ""),
                                time: new Date(pt.recorded_at).toLocaleString("ru"),
                                score: pt.score,
                                paramName: p.name_ru,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        ))}
                        {paramReadings.map((pt, di) => {
                          const labelAboveY = pt.y - 10;
                          const labelBelowY = pt.y + 18;
                          const showAbove = labelAboveY >= PADDING_TOP + 2;
                          const labelY = showAbove ? labelAboveY : labelBelowY;
                          if (!showAbove && labelBelowY > ROW_HEIGHT - 2)
                            return null;
                          return (
                            <text
                              key={`lbl-${di}`}
                              x={pt.x}
                              y={labelY}
                              textAnchor="middle"
                              fontSize={9}
                              fontWeight="500"
                              fill={
                                pt.score === 0
                                  ? "#6b7280"
                                  : pt.score === 1
                                  ? "#92400e"
                                  : "#9d174d"
                              }
                            >
                              {pt.value % 1 === 0
                                ? pt.value
                                : pt.value.toFixed(1)}
                            </text>
                          );
                        })}

                      </g>
                    </svg>
                      );
                    })()}
                  </div>
                );
              })}

            {parameters
              .filter((p: any) => p.input_type === "enum")
              .map((p: any) => {
                const paramReadings = filteredReadings
                  .map((r: any, i: number) => {
                    const val = r.ews_reading_values?.find(
                      (v: any) => v.parameter_id === p.id,
                    );
                    if (!val?.text_value) return null;
                    return {
                      x: xScale(i),
                      value: val.text_value,
                      score: val.score,
                      recorded_at: r.recorded_at,
                    };
                  })
                  .filter(Boolean) as any[];

                return (
                  <div key={p.id} className="flex border border-[#0c0480] bg-white">
                    <div
                      style={{ width: MARGIN_LEFT, height: 36 }}
                      className="shrink-0 flex items-center pl-2 border-r border-[#424543]"
                    >
                      <span className="text-xs font-medium text-gray-700">
                        {p.name_ru}
                      </span>
                    </div>
                    <svg width={chartWidth} height={36}>
                      {filteredReadings.map((_: any, i: number) => (
                        <line
                          key={i}
                          x1={xScale(i)}
                          y1={0}
                          x2={xScale(i)}
                          y2={36}
                          stroke="#424543"
                          strokeWidth={0.5}
                          strokeOpacity={0.3}
                        />
                      ))}
                      {paramReadings.map((pt) => (
                        <text
                          key={pt.x}
                          x={pt.x}
                          y={20}
                          textAnchor="middle"
                          fontSize={9}
                          fill={
                            pt.score === 0
                              ? "#374151"
                              : pt.score === 1
                              ? "#92400e"
                              : "#9d174d"
                          }
                        >
                          {pt.value === "alert"
                            ? "A"
                            : pt.value === "voice"
                            ? "V"
                            : pt.value === "pain"
                            ? "P"
                            : pt.value === "unresponsive"
                            ? "U"
                            : pt.value === "air"
                            ? "Воз"
                            : "O₂"}
                        </text>
                      ))}
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
