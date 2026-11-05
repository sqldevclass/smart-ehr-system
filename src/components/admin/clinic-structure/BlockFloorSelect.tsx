import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { floorLabel, useClinicStructure } from "./useClinicStructure";

interface Props { value: string | null; onChange: (value: string | null) => void; disabled?: boolean }

export function BlockFloorSelect({ value, onChange, disabled }: Props) {
  const { blocks, floorsByBlock, getFloor, isLoading, error } = useClinicStructure();
  const [selection, setSelection] = useState<{ value: string | null; block: string | null } | null>(null);
  const currentBlock = getFloor(value)?.block_id ?? null;
  const blockId = selection?.value === value ? selection.block : currentBlock;
  const visibleBlocks = blocks.filter(b => b.is_active || b.id === currentBlock);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
      <Select value={blockId ?? "none"} disabled={disabled || isLoading || !!error} onValueChange={id => {
        const block = id === "none" ? null : id;
        setSelection({ value: null, block });
        if (value !== null) onChange(null);
      }}>
        <SelectTrigger aria-label="Блок"><SelectValue placeholder="Блок" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Не выбрано</SelectItem>
          {visibleBlocks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}{!b.is_active ? " (неактивен)" : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value ?? "none"} disabled={disabled || !blockId || isLoading || !!error} onValueChange={id => {
        const next = id === "none" ? null : id;
        setSelection({ value: next, block: blockId });
        onChange(next);
      }}>
        <SelectTrigger aria-label="Этаж"><SelectValue placeholder="Этаж" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Не выбрано</SelectItem>
          {(blockId ? floorsByBlock.get(blockId) ?? [] : []).map(f => <SelectItem key={f.id} value={f.id}>{floorLabel(f)}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive sm:col-span-2">Не удалось загрузить блоки и этажи</p>}
    </div>
  );
}