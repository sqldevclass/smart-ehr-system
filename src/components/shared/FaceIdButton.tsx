import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Placeholder for patient identification by face. Disabled until implemented;
// wire the real flow here so every caller gets it at once.
export default function FaceIdButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons swallow hover events; the span keeps the tooltip working. */}
        <span tabIndex={0} className="inline-flex shrink-0">
          <Button type="button" variant="outline" disabled className="gap-2 pointer-events-none">
            <ScanFace className="h-4 w-4" />
            Face ID
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}

