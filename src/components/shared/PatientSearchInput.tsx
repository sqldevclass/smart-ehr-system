import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import FaceIdButton from "@/components/shared/FaceIdButton";
import { PATIENT_SEARCH_PLACEHOLDER } from "@/lib/patientSearch";

interface PatientSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showFaceId?: boolean;
}

// Shared registrar-style patient search box (icon + input, optional Face ID).
export default function PatientSearchInput({
  value,
  onChange,
  placeholder = PATIENT_SEARCH_PLACEHOLDER.en,
  className,
  showFaceId = false,
}: PatientSearchInputProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10"
        />
      </div>
      {showFaceId && <FaceIdButton />}
    </div>
  );
}

