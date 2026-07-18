import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const flow = [
  {
    name: "Capture",
    detail: "Session-correlated traffic is redacted before it leaves the customer boundary.",
  },
  {
    name: "Ledger",
    detail: "Undeclared shapes, ordering, and error templates become tenant-scoped claims.",
  },
  {
    name: "Replay",
    detail: "The same corpus runs against base and candidate builds with deterministic masks.",
  },
  {
    name: "Gate",
    detail: "T1 can block under policy. T2 warns. T3 is exposure only and never blocks.",
  },
  {
    name: "Assert",
    detail: "Pinned behavior becomes an owned compatibility assertion with an expiry.",
  },
] as const;

const docketRows = [
  ["candidate delta", "response.next_cursor renamed to response.cursor"],
  ["receipt", "response value hmac:7b91 reappears in the next request query"],
  ["tier", "T1 echo evidence: may block only if this repository policy says so"],
  ["exposure", "legacy_id remains T3 exposure only: never a blocking dependency"],
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4 sm:px-8 lg:px-12">
      <header className="flex min-h-12 items-center justify-between gap-4 border-b pb-4">
        <BrandMark />
        <Button asChild variant="outline" size="sm">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </header>

      <section
        className="grid flex-1 content-center gap-8 py-8 sm:py-12"
        aria-labelledby="home-title"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:items-end">
          <div className="grid gap-4">
            <p className="max-w-xl text-sm text-muted-foreground">
              Hyrum is the ledger for accidental API contracts: the behavior your consumers learned
              from production, not from your OpenAPI file.
            </p>
            <h1
              id="home-title"
              className="max-w-3xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl"
            >
              Put the receipt in front of the merge.
            </h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/sign-in">Open workspace</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="w-full sm:w-auto">
              <Link href="/api/health">Service health</Link>
            </Button>
          </div>
        </div>

        <article
          className="overflow-hidden rounded-lg border bg-card text-card-foreground"
          aria-labelledby="artifact-title"
        >
          <div className="grid gap-4 border-b p-4 sm:grid-cols-[1fr_auto] sm:p-6">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Illustrative redacted artifact</p>
              <h2 id="artifact-title" className="mt-1 text-sm font-semibold">
                Docket HYR-PR-184: candidate compatibility gate
              </h2>
            </div>
            <p className="text-sm text-muted-foreground sm:text-right">
              Deterministic diff first. Model prose is advisory.
            </p>
          </div>

          <ol className="grid border-b lg:grid-cols-5">
            {flow.map((item, index) => (
              <li
                key={item.name}
                className="grid gap-2 border-b p-4 last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold">{item.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
              </li>
            ))}
          </ol>

          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <section className="min-w-0" aria-labelledby="receipt-title">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h3 id="receipt-title" className="text-sm font-semibold">
                  Redacted sequence receipt
                </h3>
                <span className="font-mono text-xs text-muted-foreground">sample</span>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-industrial p-4 text-xs leading-6 text-foreground">
                <code>{`response[12].body.next_cursor = hmac:7b91
request[13].query.cursor     = hmac:7b91
match                         = complete-session echo
gate input                    = signed replay delta + policy`}</code>
              </pre>
            </section>

            <section className="min-w-0" aria-labelledby="decision-title">
              <h3 id="decision-title" className="mb-3 text-sm font-semibold">
                Gate decision trace
              </h3>
              <dl className="grid border-t">
                {docketRows.map(([term, description]) => (
                  <div key={term} className="grid gap-1 border-b py-3 sm:grid-cols-[8rem_1fr]">
                    <dt className="font-mono text-xs text-muted-foreground">{term}</dt>
                    <dd className="text-sm">{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </article>
      </section>

      <footer className="border-t py-4 text-xs text-muted-foreground">
        <p>Capture and replay share the same extractor. Raw bodies and secrets stay out.</p>
      </footer>
    </main>
  );
}
