import type { ReactNode } from "react";
import StayScalesHistory from "@/components/assessments/StayScalesHistory";
import StayRows from "@/components/nurse/StayRows";
import StayFluidHistory from "@/components/nurse/StayFluidHistory";
import StayDevicesHistory, { STAY_DEVICE_RECORDS_LIMIT } from "@/components/nurse/StayDevicesHistory";
import PainReadingCell, { type PainReading } from "@/components/nurse/PainReadingCell";
import GlucoseReadingCell, { type GlucoseReading } from "@/components/nurse/GlucoseReadingCell";
import DailyNoteItem, { type DailyNote } from "@/components/nurse/DailyNoteItem";
import { useStayDataCounts, type StayDataCounts } from "@/hooks/useStayDataCounts";
import { STAY_ROWS_LIMIT } from "@/hooks/useStayRows";

interface Block {
  key: keyof StayDataCounts;
  title: string;
  /** Most records this block shows; a note appears when the stay has more. */
  limit: number;
  render: (hospitalizationId: string) => ReactNode;
}

const STAY_BLOCKS: Block[] = [
  {
    key: "scales",
    title: "Шкалы",
    limit: 200,
    render: (id) => <StayScalesHistory hospitalizationId={id} />,
  },
  {
    key: "pain",
    title: "Боль",
    limit: STAY_ROWS_LIMIT,
    render: (id) => (
      <StayRows<PainReading>
        table="pain_scale_readings"
        select="id, score, pain_character, pain_location, recorded_at, profiles!recorded_by(full_name)"
        hospitalizationId={id}
        orderBy="recorded_at"
        className="flex flex-wrap gap-x-4 gap-y-2"
        renderRow={(reading) => <PainReadingCell reading={reading} />}
      />
    ),
  },
  {
    key: "glucose",
    title: "Глюкоза крови",
    limit: STAY_ROWS_LIMIT,
    render: (id) => (
      <StayRows<GlucoseReading>
        table="blood_glucose_readings"
        select="id, value_mmol, recorded_at"
        hospitalizationId={id}
        orderBy="recorded_at"
        className="flex flex-wrap gap-6"
        renderRow={(reading) => <GlucoseReadingCell reading={reading} />}
      />
    ),
  },
  {
    key: "fluid",
    title: "Баланс жидкости",
    limit: Infinity, // summed per day in the database, so nothing is cut off
    render: (id) => <StayFluidHistory hospitalizationId={id} />,
  },
  {
    key: "notes",
    title: "Дневниковые записи",
    limit: STAY_ROWS_LIMIT,
    render: (id) => (
      <StayRows<DailyNote>
        table="nursing_daily_notes"
        select="id, note_text, recorded_at, profiles:recorded_by(full_name)"
        hospitalizationId={id}
        orderBy="recorded_at"
        className="space-y-2"
        renderRow={(note) => <DailyNoteItem note={note} />}
      />
    ),
  },
  {
    key: "devices",
    title: "Устройства",
    limit: STAY_DEVICE_RECORDS_LIMIT,
    render: (id) => <StayDevicesHistory hospitalizationId={id} />,
  },
];

interface Props {
  hospitalizationId: string;
}

/**
 * Everything the nursing monitoring panel recorded during one past
 * hospitalization. Only the parts that have records are shown, and a part says
 * so when it is showing just the newest of more.
 */
export default function StayMonitoringHistory({ hospitalizationId }: Props) {
  const { data: counts, isLoading, error } = useStayDataCounts(hospitalizationId);

  if (isLoading) return <p className="text-xs text-muted-foreground">Загрузка...</p>;
  if (error || !counts) return <p className="text-xs text-destructive">Не удалось загрузить историю</p>;

  const blocks = STAY_BLOCKS.filter((block) => counts[block.key] > 0);
  if (blocks.length === 0) return <p className="text-xs text-muted-foreground">Нет записей</p>;

  return (
    <div className="space-y-4">
      {blocks.map((block) => (
        <div key={block.key} className="space-y-2">
          <p className="text-sm font-semibold">{block.title}</p>
          {block.render(hospitalizationId)}
          {counts[block.key] > block.limit && (
            <p className="text-xs text-muted-foreground">
              Показаны последние {block.limit} из {counts[block.key]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
