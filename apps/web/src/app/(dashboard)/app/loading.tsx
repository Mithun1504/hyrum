import { Skeleton } from "@/components/ui/skeleton";

const navigationPlaceholders = [
  "overview",
  "capture",
  "ledger",
  "gate",
  "assertions",
  "replay",
  "policy",
];
const evidencePlaceholders = ["decision", "blocker", "warning", "note"];

export default function DashboardLoading() {
  return (
    <main
      className="min-h-dvh bg-background md:grid md:grid-cols-[248px_1fr]"
      aria-label="Loading workspace"
    >
      <aside className="hidden border-r border-border bg-card px-4 py-5 md:block">
        <Skeleton className="h-7 w-24 rounded-[3px]" />
        <Skeleton className="mt-6 h-11 w-full rounded-[4px]" />
        <div className="mt-7 grid gap-2">
          {navigationPlaceholders.map((placeholder) => (
            <Skeleton key={placeholder} className="h-9 w-full rounded-[3px]" />
          ))}
        </div>
      </aside>
      <section className="px-4 py-5 md:px-8 md:py-8">
        <Skeleton className="h-4 w-32 rounded-[3px]" />
        <Skeleton className="mt-5 h-10 w-[min(26rem,85%)] rounded-[3px]" />
        <Skeleton className="mt-3 h-4 w-[min(36rem,95%)] rounded-[3px]" />
        <div className="mt-8 overflow-hidden rounded-md border">
          <Skeleton className="h-16 w-full rounded-none" />
          <div className="divide-y divide-border">
            {evidencePlaceholders.map((placeholder) => (
              <Skeleton key={placeholder} className="h-20 w-full rounded-none" />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
