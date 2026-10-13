import { useMemo, useState } from "react";
import type { Column } from "@tanstack/react-table";
import { Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface Props<TData> {
  column: Column<TData, unknown>;
}

export function DataTableColumnFilter<TData>({ column }: Props<TData>) {
  const [search, setSearch] = useState("");

  const facets = column.getFacetedUniqueValues();
  const options = useMemo(
    () =>
      Array.from(facets.keys())
        .map((v) => (v == null ? "" : String(v)))
        .sort((a, b) => a.localeCompare(b)),
    [facets],
  );

  const selected = column.getFilterValue() as Set<string> | undefined;
  const isFiltered = selected !== undefined;
  const effectiveSelected = selected ?? new Set(options);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const toggle = (value: string) => {
    const next = new Set(effectiveSelected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    column.setFilterValue(next.size === options.length ? undefined : next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`ml-1 shrink-0 rounded p-0.5 ${isFiltered ? "bg-blue-500 text-white" : "text-muted-foreground/50 hover:text-foreground"}`}
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
          <button type="button" className="text-blue-600 hover:underline" onClick={() => column.setFilterValue(undefined)}>
            Все
          </button>
          <button type="button" className="text-blue-600 hover:underline" onClick={() => column.setFilterValue(new Set<string>())}>
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
