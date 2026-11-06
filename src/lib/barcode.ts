import JsBarcode from "jsbarcode";

export function renderBarcodeSvg(
  value: string,
  opts: { height?: number; displayValue?: boolean; barWidth?: number; fontSize?: number } = {},
): string | null {
  try {
    if (!value.trim()) return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      height: opts.height ?? 40,
      displayValue: opts.displayValue ?? true,
      width: opts.barWidth ?? 2,
      fontSize: opts.fontSize ?? 16,
      margin: 10,
    });
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", value);
    return svg.outerHTML;
  } catch {
    return null;
  }
}