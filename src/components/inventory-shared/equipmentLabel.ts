import { renderBarcodeSvg } from "@/lib/barcode";
import { escapeHtml } from "@/lib/utils";

export function buildEquipmentLabelHtml({ name, floorText, locationName, inventoryNumber }: {
  name: string;
  floorText: string;
  locationName: string;
  inventoryNumber: string;
}): string {
  const barcode = renderBarcodeSvg(inventoryNumber, { height: 38, displayValue: false });
  return `<style>
    .equipment-label { width: 100%; height: 100%; padding: 3mm; border: 1px solid var(--label-border, #ddd); border-radius: 3mm; font-family: "Times New Roman", serif; display: flex; flex-direction: column; }
    .equipment-label .name { font-size: 14pt; line-height: 1.05; overflow-wrap: anywhere; max-height: 12mm; overflow: hidden; }
    .equipment-label .location { margin-top: auto; font-size: 9pt; line-height: 1.1; overflow-wrap: anywhere; max-height: 8mm; overflow: hidden; }
    .equipment-label .barcode { margin-top: 1mm; height: 10mm; }
    .equipment-label .barcode svg { width: 100%; height: 10mm; }
    .equipment-label .number { text-align: center; font-size: 9pt; line-height: 1.1; overflow-wrap: anywhere; }
    @media print { .equipment-label { border: none; } }
  </style><div class="equipment-label">
    <div class="name">${escapeHtml(name)}</div>
    <div class="location">${floorText ? `<div>${escapeHtml(floorText)}</div>` : ""}<div>${escapeHtml(locationName)}</div></div>
    ${barcode ? `<div class="barcode">${barcode}</div>` : ""}
    <div class="number">${escapeHtml(inventoryNumber)}</div>
  </div>`;
}