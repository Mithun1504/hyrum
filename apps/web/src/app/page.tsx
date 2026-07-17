import { ArrowRight, Braces, GitPullRequestArrow, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const foundations = [
  {
    icon: Braces,
    label: "Deterministic extraction",
    description:
      "Shared capture and replay extractors turn redacted sequences into verifiable behavior facts.",
  },
  {
    icon: GitPullRequestArrow,
    label: "Differential replay",
    description:
      "Isolated base and candidate builds prove semantic changes before a release reaches customers.",
  },
  {
    icon: ShieldCheck,
    label: "Evidence-backed gates",
    description:
      "T1 echo evidence can block, T2 warns, and T3 stays informational—with receipts behind every claim.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-page py-8">
      <header className="flex items-center justify-between">
        <BrandMark />
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </header>

      <section className="flex flex-1 flex-col justify-center py-20">
        <Badge variant="secondary" className="mb-6 w-fit">
          Developer tools · OpenAI hackathon
        </Badge>
        <h1 className="max-w-4xl text-balance text-5xl font-semibold tracking-tight sm:text-7xl">
          Catch the API contracts you never meant to create.
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
          Hyrum turns redacted production behavior into an evidence-backed compatibility ledger,
          then measures proposed changes before customers discover them for you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/sign-in">
              Open workspace <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/api/health">Check web health</Link>
          </Button>
        </div>
      </section>

      <section aria-label="Platform foundations" className="grid gap-4 pb-8 md:grid-cols-3">
        {foundations.map(({ icon: Icon, label, description }) => (
          <Card key={label}>
            <CardHeader>
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <CardTitle className="text-base">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
