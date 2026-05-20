import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface Props {
  fieldId: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  isReadOnly: boolean;
}

export default function ICD10SearchField({ fieldId, value, onChange, isReadOnly }: Props) {
  const [searchTerm, setSearchTerm] = useState<string>(() => value || "");
  const [isOpen, setIsOpen] = useState(false);

  const { data: results = [] } = useQuery({
    queryKey: ["icd10-field", fieldId, searchTerm],
    queryFn: async () => {
      const term = searchTerm.trim();
      if (term.length < 1) return [];
      const { data } = await supabase
        .from("icd10_codes")
        .select("id, code, name_ru")
        .eq("is_leaf", true)
        .or(`name_ru.ilike.%${term}%,code.ilike.%${term}%`)
        .limit(20);
      return data || [];
    },
    enabled: searchTerm.trim().length >= 1,
  });

  if (isReadOnly) {
    return (
      <div className="text-sm text-gray-900 min-h-[1.5rem] py-1 border-b border-gray-100">
        {value || <span className="text-gray-400 italic">Не заполнено</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        placeholder="Поиск по МКБ-10..."
      />
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
          {results.map((r: any) => (
            <div
              key={r.id}
              className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const display = `${r.code} — ${r.name_ru}`;
                setSearchTerm(display);
                onChange(display);
                setIsOpen(false);
              }}
            >
              <span className="font-medium">{r.code}</span>
              {" — "}
              {r.name_ru}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
