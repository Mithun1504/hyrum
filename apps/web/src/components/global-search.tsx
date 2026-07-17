import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function GlobalSearch({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <search className="w-full max-w-sm">
      <form action="/app/search" className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          name="q"
          type="search"
          defaultValue={defaultValue}
          minLength={2}
          maxLength={100}
          placeholder="Search endpoints, consumers, ledger…"
          aria-label="Search workspace"
          className="pl-9"
        />
      </form>
    </search>
  );
}
