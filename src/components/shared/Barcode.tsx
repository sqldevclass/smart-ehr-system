import { useMemo } from "react";
import { renderBarcodeSvg } from "@/lib/barcode";

export function Barcode({ value, height, displayValue }: { value: string; height?: number; displayValue?: boolean }) {
  const svg = useMemo(() => renderBarcodeSvg(value, { height, displayValue }), [value, height, displayValue]);
  return svg
    ? <div className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    : <span className="font-mono break-all">{value}</span>;
}