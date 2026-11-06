export const LABEL_SIZES = {
  equipment: { widthMm: 60, heightMm: 40 },
  labSample: { widthMm: 60, heightMm: 40 },
};

export function printLabel(innerHtml: string, size: { widthMm: number; heightMm: number }): void {
  if (![size.widthMm, size.heightMm].every((v) => Number.isFinite(v) && v > 0)) return;
  const iframe = document.createElement("iframe");
  iframe.title = "Печать этикетки";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", left: "-10000px", width: "1px", height: "1px", border: "0" });
  let fallback: ReturnType<typeof setTimeout>;
  const cleanup = () => {
    clearTimeout(fallback);
    iframe.remove();
  };
  iframe.onload = async () => {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) { cleanup(); return; }
    win.addEventListener("afterprint", cleanup, { once: true });
    try {
      await doc.fonts.ready;
      await Promise.all(Array.from(doc.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      })));
      if (!iframe.isConnected) return;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!iframe.isConnected) return;
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };
  iframe.srcdoc = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Этикетка</title><style>
    :root { --label-paper: #fff; --label-ink: #000; --label-border: #ddd; }
    @page { size: ${size.widthMm}mm ${size.heightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${size.widthMm}mm; height: ${size.heightMm}mm; margin: 0; padding: 0; color: var(--label-ink); background: var(--label-paper); }
    svg { display: block; max-width: 100%; }
    @media print { .equipment-label { border: none !important; } }
  </style></head><body>${innerHtml}</body></html>`;
  fallback = setTimeout(cleanup, 60_000);
  document.body.appendChild(iframe);
}