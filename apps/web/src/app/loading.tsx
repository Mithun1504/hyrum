import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-page" aria-label="Loading page" role="status">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-72 w-full" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}
