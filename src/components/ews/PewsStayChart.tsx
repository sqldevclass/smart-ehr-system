import EWSChart from "./EWSChart";
import { useEwsOverrides } from "@/hooks/useEwsOverrides";

interface Props {
  hospitalizationId: string;
  parameters: any[];
  thresholds: any[];
}

/**
 * Read-only PEWS chart for one past hospitalization, drawn with that stay's
 * own threshold overrides so the colored bands match how it was scored then.
 */
export default function PewsStayChart({ hospitalizationId, parameters, thresholds }: Props) {
  const { overrideMap, isLoading } = useEwsOverrides(hospitalizationId);
  if (isLoading) return <p className="text-xs text-muted-foreground">Загрузка...</p>;
  return (
    <EWSChart
      hospitalizationId={hospitalizationId}
      parameters={parameters}
      thresholds={thresholds}
      overrideMap={overrideMap}
    />
  );
}
