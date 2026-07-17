import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <main className="min-h-dvh bg-background p-4 md:grid md:grid-cols-[232px_1fr] md:p-0">
      <aside className="hidden border-r border-border bg-industrial p-4 md:block">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-4 h-10 w-full" />
        <div className="mt-4 grid gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </aside>
      <section className="p-4 md:p-8" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-72 w-full rounded-xl" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </section>
    </main>
  );
}
