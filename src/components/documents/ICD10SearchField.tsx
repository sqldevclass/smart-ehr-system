import { useState } from "react";
import SearchInput from "@/components/shared/SearchInput";
import HighlightMatch from "@/components/shared/HighlightMatch";
import { useIcd10Search } from "@/hooks/useIcd10Search";

interface Props {
  fieldId: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  isReadOnly: boolean;
}

export default function ICD10SearchField({ fieldId, value, onChange, onBlur, isReadOnly }: Props) {
  const [searchTerm, setSearchTerm] = useState<string>(() => value || "");
  const [isOpen, setIsOpen] = useState(false);

  const { data: results = [] } = useIcd10Search(searchTerm);

  if (isReadOnly) {
    return (
      <div className="text-sm text-gray-900 min-h-[1.5rem] py-1 border-b border-gray-100">
        {value || <span className="text-gray-400 italic">Не заполнено</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      <SearchInput
        value={searchTerm}
        onChange={(v) => {
          setSearchTerm(v);
          setIsOpen(true);
          if (!v) onChange("");
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => { setTimeout(() => setIsOpen(false), 200); onBlur?.(); }}
        placeholder="Поиск по МКБ-10 (код или название)"
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
              <span className="font-medium"><HighlightMatch text={r.code} term={searchTerm} /></span>
              {" — "}
              <HighlightMatch text={r.name_ru} term={searchTerm} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
