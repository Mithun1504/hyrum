import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

const workflow = [
  {
    number: "01",
    name: "Capture",
    detail: "Redact session-correlated API traffic inside your boundary.",
  },
  {
    number: "02",
    name: "Prove",
    detail: "Build a per-consumer ledger of undeclared behavior and its evidence.",
  },
  {
    number: "03",
    name: "Replay",
    detail: "Run the same corpus against base and candidate builds.",
  },
  {
    number: "04",
    name: "Decide",
    detail: "Apply your policy to stable deltas before the change merges.",
  },
] as const;

const evidenceTiers = [
  {
    tier: "T1",
    label: "Echo evidence",
    outcome: "May block",
    detail: "A response-only value appears in a later request from the same complete session.",
    className: "text-tier-proof",
  },
  {
    tier: "T2",
    label: "Pattern evidence",
    outcome: "Warns",
    detail:
      "Request behavior changes with an observed response pattern, but does not prove reliance.",
    className: "text-tier-pattern",
  },
  {
    tier: "T3",
    label: "Exposure",
    outcome: "Never blocks",
    detail: "A consumer received the behavior. Hyrum does not call that a dependency.",
    className: "text-tier-exposure",
  },
] as const;

const decisionRows = [
  ["candidate delta", "response.next_cursor renamed to response.cursor"],
  ["receipt", "response hash hmac:7b91 appears in the next request query"],
  ["evidence", "T1 echo from a complete consumer session"],
  ["decision", "block under repository policy v12"],
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 sm:px-8 lg:px-12">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b">
        <BrandMark />
        <nav className="flex items-center gap-2" aria-label="Public navigation">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="#method">How it works</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="flex min-h-[calc(100svh-4rem)] flex-col justify-center gap-10 border-b py-16 sm:py-24 lg:grid lg:content-center lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div className="max-w-4xl">
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
            Catch API breaks before release.
          </h1>
        </div>

        <div className="grid gap-6">
          <p className="text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Hyrum finds the undocumented behavior consumers rely on, proves it with redacted traffic
            receipts, and tests proposed changes with deterministic replay.
          </p>
          <Button asChild size="lg" className="w-full sm:w-fit">
            <Link href="/sign-in">Open workspace</Link>
          </Button>
        </div>
      </section>

      <section className="grid border-b lg:grid-cols-[0.7fr_1.3fr]" aria-labelledby="problem-title">
        <div className="border-b py-10 lg:border-r lg:border-b-0 lg:pr-10">
          <h2
            id="problem-title"
            className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Your OpenAPI file records the contract you declared.
          </h2>
        </div>
        <div className="grid gap-5 py-10 lg:pl-10">
          <p className="max-w-3xl text-xl leading-8 sm:text-2xl sm:leading-9">
            Consumers also learn from field presence, ordering, error templates, and values you
            never promised. Those accidental contracts usually surface after a release.
          </p>
          <p className="max-w-2xl text-muted-foreground">
            Hyrum records them by consumer, keeps the receipt, and checks candidate builds before
            merge.
          </p>
        </div>
      </section>

      <section id="method" className="border-b py-12 sm:py-16" aria-labelledby="method-title">
        <div className="mb-8 grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-end">
          <h2 id="method-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            From traffic to a gate decision
          </h2>
          <p className="max-w-xl text-muted-foreground sm:justify-self-end">
            Capture and replay use the same versioned Go extractors, so the evidence and the diff
            share one definition of behavior.
          </p>
        </div>

        <ol className="grid border-t sm:grid-cols-2 lg:grid-cols-4">
          {workflow.map((item) => (
            <li
              key={item.number}
              className="grid min-h-48 content-between gap-8 border-b py-5 sm:pr-6 sm:odd:border-r sm:even:pl-6 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
            >
              <span className="font-mono text-xs text-muted-foreground">{item.number}</span>
              <div>
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <p className="mt-2 text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid border-b lg:grid-cols-[0.82fr_1.18fr]" aria-labelledby="proof-title">
        <div className="border-b py-12 lg:border-r lg:border-b-0 lg:pr-10">
          <h2
            id="proof-title"
            className="max-w-md text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            A gate that blocks only on proof
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Exposure and reliance are different facts. Hyrum keeps them separate so a busy ledger
            does not become a noisy gate.
          </p>
        </div>

        <dl className="divide-y py-4 lg:pl-10">
          {evidenceTiers.map((item) => (
            <div
              key={item.tier}
              className="grid gap-3 py-6 sm:grid-cols-[4rem_9rem_1fr] sm:items-baseline"
            >
              <dt className={`font-mono text-sm font-semibold ${item.className}`}>{item.tier}</dt>
              <dd className="font-semibold">
                {item.label}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {item.outcome}
                </span>
              </dd>
              <dd className="text-muted-foreground">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-b py-12 sm:py-16" aria-labelledby="artifact-title">
        <div className="mb-7 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h2 id="artifact-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              The reason for a block stays inspectable.
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">Illustrative, redacted data</p>
        </div>

        <article className="overflow-hidden border bg-card text-card-foreground">
          <div className="grid gap-6 border-b p-5 md:grid-cols-[1fr_1fr] md:p-7">
            <div>
              <p className="font-mono text-xs text-muted-foreground">HYR-PR-184 / candidate gate</p>
              <p className="mt-3 text-lg font-semibold">Pagination cursor compatibility</p>
            </div>
            <pre className="overflow-x-auto bg-industrial p-4 text-xs leading-6">
              <code>{`response[12].next_cursor = hmac:7b91
request[13].cursor = hmac:7b91
match = complete session echo`}</code>
            </pre>
          </div>
          <dl className="divide-y">
            {decisionRows.map(([term, description]) => (
              <div key={term} className="grid gap-1 px-5 py-4 sm:grid-cols-[10rem_1fr] md:px-7">
                <dt className="font-mono text-xs text-muted-foreground">{term}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="grid gap-8 border-b py-12 sm:grid-cols-[1fr_auto] sm:items-center sm:py-16">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Review the evidence before the merge.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Deterministic extraction and replay own the decision. Model output may label, explain,
            rank, or draft, but it never sets the gate.
          </p>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/sign-in">Open workspace</Link>
        </Button>
      </section>

      <footer className="grid gap-1 py-6 text-xs text-muted-foreground">
        <p>Hyrum</p>
        <p>Redact before egress. Keep secrets and raw bodies out.</p>
      </footer>
    </main>
  );
}
