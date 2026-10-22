import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  // Classes for the <input> itself (className styles the wrapper).
  inputClassName?: string;
  // Optional element after the input (e.g. Face ID button).
  trailing?: ReactNode;
}

// The one search box used everywhere. Matching/highlighting lives in src/lib/search.ts.
const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, className, inputClassName, trailing, ...inputProps }, ref) => (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={ref}
          {...inputProps}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("pl-9", inputClassName)}
        />
      </div>
      {trailing}
    </div>
  )
);
SearchInput.displayName = "SearchInput";

export default SearchInput;
