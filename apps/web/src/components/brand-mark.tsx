import { cn } from "@/lib/utils";

export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <svg
        aria-hidden="true"
        className="h-6 w-5 text-primary"
        viewBox="0 0 20 24"
        fill="none"
        role="img"
      >
        <path d="M3 2v20M17 2v20M3 12h14" stroke="currentColor" strokeWidth="2.2" />
        <path d="M6 7h8M6 17h8" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      </svg>
      <span className="text-[0.95rem]">Hyrum</span>
    </div>
  );
}
