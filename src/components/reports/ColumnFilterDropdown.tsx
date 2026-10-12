import { useMemo, useState } from "react";
import { Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface Props {
  options: string[];
  selected: Set<string> | null; // null = no filter active (everything shown)
  onChange: (next: Set<string> | null) => void;
}

export default function ColumnFilterDropdown({ options, selected, onChange }: Props) {
  const [search, setSearch] = useState("");
  const isFiltered = selected !== null;

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const effectiveSelected = selected ?? new Set(options);

  const toggle = (value: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === options.length ? null : next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`ml-1 shrink-0 ${isFiltered ? "text-primary" : "text-muted-foreground/50"} hover:text-foreground`}
          title="Фильтр"
          onClick={(e) => e.stopPropagation()}
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
        />
        <div className="flex justify-between text-xs mb-2 px-1">
          <button type="button" className="text-blue-600 hover:underline" onClick={() => onChange(null)}>
            Все
          </button>
          <button type="button" className="text-blue-600 hover:underline" onClick={() => onChange(new Set())}>
            Очистить
          </button>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filteredOptions.length === 0 ? (
            <div className="text-xs text-muted-foreground p-1">Нет значений</div>
          ) : (
            filteredOptions.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted"
              >
                <Checkbox checked={effectiveSelected.has(opt)} onCheckedChange={() => toggle(opt)} />
                <span className="truncate">{opt || "(пусто)"}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
