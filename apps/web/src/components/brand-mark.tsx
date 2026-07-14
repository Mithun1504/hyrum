import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <ScanSearch className="size-4" aria-hidden="true" />
      </span>
      <span>Hyrum</span>
    </div>
  );
}
