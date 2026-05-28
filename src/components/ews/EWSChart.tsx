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

const MARGIN_LEFT = 52;
const ROW_HEIGHT = 100;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;
const chartHeight = ROW_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

const zoneFill: Record<string, string> = {
  white: "#ffffff",
  yellow: "#fef9c3",
  pink: "#fce7f3",
};
const zoneFillOverride = "#eff6ff";

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
      ? chartWidth / (filteredReadings.length - 1)
      : chartWidth / 2;
  const xScale = (index: number) =>
    filteredReadings.length <= 1 ? chartWidth / 2 : index * cellWidth;

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
    return PADDING_TOP + chartHeight - ((value - yMin) / range) * chartHeight;
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
        <div className="overflow-x-auto border rounded-lg relative">
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
            <div className="flex sticky top-0 bg-white z-10 border-b">
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

                return (
                  <div
                    key={p.id}
                    className={cn(
                      "flex border-b last:border-b-0",
                      paramIdx % 2 === 0 ? "bg-gray-50/30" : "bg-white",
                    )}
                  >
                    <div
                      style={{ width: MARGIN_LEFT, height: ROW_HEIGHT }}
                      className="shrink-0 flex flex-col items-end justify-between pr-2 py-2 border-r"
                    >
                      <span className="text-xs font-medium text-gray-700 leading-tight text-right">
                        {p.name_ru}
                      </span>
                      {p.unit && (
                        <span className="text-xs text-muted-foreground">
                          {p.unit}
                        </span>
                      )}
                      {latest && (
                        <span
                          className={cn(
                            "text-xs font-bold",
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
                    </div>

                    <svg
                      width={chartWidth}
                      height={ROW_HEIGHT}
                      className="overflow-visible"
                    >
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
                      {paramThresholds.map((th: any, ti: number) => (
                        <g key={`line-${ti}`}>
                          {th.min_value !== null &&
                            th.min_value !== undefined &&
                            th.min_value > yMin && (
                              <line
                                x1={0}
                                y1={yScale(th.min_value, yMin, yMax)}
                                x2={chartWidth}
                                y2={yScale(th.min_value, yMin, yMax)}
                                stroke="#e5e7eb"
                                strokeWidth={1}
                                strokeDasharray="4 2"
                              />
                            )}
                        </g>
                      ))}
                      {paramReadings.length > 1 && (
                        <path
                          d={linePath}
                          fill="none"
                          stroke="#3b82f6"
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
                              ? "#3b82f6"
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
                    </svg>
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
                  <div key={p.id} className="flex border-t bg-white">
                    <div
                      style={{ width: MARGIN_LEFT }}
                      className="shrink-0 flex items-center justify-end pr-2 border-r text-xs font-medium text-gray-700 py-2"
                    >
                      {p.name_ru}
                    </div>
                    <svg width={chartWidth} height={28}>
                      {paramReadings.map((pt, i) => (
                        <text
                          key={i}
                          x={pt.x}
                          y={18}
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
                            ? "воз"
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
