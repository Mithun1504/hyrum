import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-page" aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-72 w-full" />
    </main>
  );
}
