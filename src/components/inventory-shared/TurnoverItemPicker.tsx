import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { TurnoverKind } from "./turnoverTypes";

interface Props { kind: TurnoverKind; value: string | null; onChange: (id: string | null) => void }

export function TurnoverItemPicker({ kind, value, onChange }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: ["turnover-items", kind, user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const q = kind === "drug"
        ? supabase.from("drug_formulary").select("id, name:trade_name").eq("hospital_id", user!.hospitalId).eq("is_active", true).order("trade_name")
        : supabase.from("products").select("id, name").eq("hospital_id", user!.hospitalId).eq("is_active", true).order("name");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const selected = items.find((i) => i.id === value);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-64 justify-between font-normal">
            <span className="truncate">{selected?.name ?? "Все позиции"}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <Command>
            <CommandInput placeholder="Поиск…" />
            <CommandList>
              <CommandEmpty>Ничего не найдено</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__all Все позиции" onSelect={() => { onChange(null); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === null ? "opacity-100" : "opacity-0"}`} />Все позиции
                </CommandItem>
                {items.map((i) => (
                  <CommandItem key={i.id} value={`${i.name} ${i.id}`} onSelect={() => { onChange(i.id); setOpen(false); }}>
                    <Check className={`mr-2 h-4 w-4 ${value === i.id ? "opacity-100" : "opacity-0"}`} />{i.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" aria-label="Очистить" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
