import { ArrowLeft, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { overrideClaimAction } from "@/app/(dashboard)/app/actions";
import { Button } from "@/components/ui/button";
import { ClaimOverrideForm } from "@/components/workspace/claim-override-form";
import { OutcomeBadge, TierBadge, TierLegend } from "@/components/workspace/tier-badge";
import type {
  EvidenceTier,
  LedgerRow,
  ReplayDelta,
  WorkspaceSnapshot,
} from "@/services/workspace-data";

export function BehaviorView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const row = snapshot.selected;

  if (!row) {
    return (
      <QuietEmpty
        title="No behavior selected"
        description="Open a ledger row to inspect its receipt and consumer attribution."
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-6">
      <EvidenceHeader
        eyebrow="Behavior receipt"
        title={row.title}
        description={`Receipt-bound evidence selected from ${row.endpoint} for ${row.consumer_alias}. The endpoint is retained context; the tier comes from stored evidence, not generated prose.`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/app?view=ledger" prefetch={false}>
                <ArrowLeft aria-hidden="true" />
                Ledger
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app?view=gate" prefetch={false}>
                Gate decision
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.75fr)]">
        <section className="min-w-0 rounded-md border border-border bg-card p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">Receipt sequence</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Capture and replay use the same extractor version. This view shows only redacted,
                receipt-bound values.
              </p>
            </div>
            <TierBadge tier={row.tier} />
          </div>
          <ReceiptEvidence receipt={snapshot.receipt} row={row} />
          <ClaimOverrideForm
            claimId={row.claim_id}
            currentTier={row.tier}
            canOverride={snapshot.permissions.canOverrideClaim}
            action={overrideClaimAction}
          />
        </section>

        <section className="min-w-0 rounded-md border border-border bg-card p-4 md:p-6">
          <h2 className="text-base font-semibold">Consumer attribution</h2>
          <p className="text-sm text-muted-foreground">
            Only consumers linked to this behavior by a stored ledger row are listed.
          </p>
          <ConsumerAttribution snapshot={snapshot} row={row} />
        </section>
      </div>

      <TierLegend />
    </div>
  );
}

function ReceiptEvidence({
  receipt,
  row,
}: {
  receipt: WorkspaceSnapshot["receipt"];
  row: LedgerRow;
}) {
  if (!receipt) {
    return (
      <QuietEmpty
        title="No receipt attached"
        description="The ledger entry exists, but there is no redacted sequence bundle to review."
      />
    );
  }

  const excerptRows = excerptToRows(receipt.excerpt);
  const echoHash = excerptRows.find((item) => /hash/i.test(item.label))?.value ?? null;

  return (
    <div className="mt-6 grid gap-6">
      {receipt.object_key === null ? (
        <div className="rounded-lg border border-tier-pattern/50 bg-tier-pattern/10 p-4 text-sm text-tier-pattern">
          Receipt metadata is still available. The durable bundle has expired or was not stored.
        </div>
      ) : null}

      <div className="grid overflow-hidden rounded-md border md:grid-cols-3 md:divide-x md:divide-y-0">
        <ReceiptStep
          label="Response sample"
          value={`sequence ${receipt.sequence_start}`}
          detail={row.tier === "T1" ? "source of echoed value" : "observed behavior"}
        />
        <ReceiptStep
          label={row.tier === "T1" ? "Later request" : "Sequence close"}
          value={`sequence ${receipt.sequence_end}`}
          detail={row.tier === "T1" ? "same keyed hash appears" : "receipt boundary"}
        />
        <ReceiptStep
          label="Decision tier"
          value={tierMeaning(row.tier)}
          detail={
            row.tier === "T3"
              ? "exposure only"
              : `${row.observation_count} observations across ${row.session_count} captured sessions; receipt attached`
          }
        />
      </div>

      {row.tier === "T1" ? (
        <div className="rounded-lg border border-tier-proof/45 bg-tier-proof/10 p-4">
          <h3 className="text-sm font-semibold text-tier-proof">Echo proof</h3>
          <p className="mt-1 text-sm text-foreground">
            A value unique to the undocumented response appears again in a later request from the
            same consumer session.
          </p>
          <p className="mt-3 font-data text-xs text-muted-foreground">
            keyed hash:{" "}
            <span className="break-all text-foreground">{echoHash ?? "not shown in excerpt"}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background/55 p-4 text-sm">
          <b>{tierMeaning(row.tier)}.</b> {tierExplanation(row.tier)}
        </div>
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
        <MetaTerm>digest</MetaTerm>
        <MetaValue>{receipt.digest}</MetaValue>
        <MetaTerm>redaction</MetaTerm>
        <MetaValue>{receipt.redaction_version}</MetaValue>
        <MetaTerm>expires</MetaTerm>
        <MetaValue>{new Date(receipt.expires_at).toLocaleString("en-US")}</MetaValue>
      </dl>

      <div className="overflow-hidden rounded-md border border-border bg-background/55">
        <h3 className="border-b px-4 py-3 text-sm font-semibold">Redacted excerpt</h3>
        <div className="divide-y divide-border">
          {excerptRows.map((item) => (
            <div
              key={item.label}
              className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[128px_minmax(0,1fr)]"
            >
              <span className="text-muted-foreground">{item.label}</span>
              <span className="min-w-0 break-all font-data text-xs text-foreground">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConsumerAttribution({ snapshot, row }: { snapshot: WorkspaceSnapshot; row: LedgerRow }) {
  const attributedRows = snapshot.allLedgerRows.filter(
    (candidate) => candidate.behavior_id === row.behavior_id,
  );

  if (attributedRows.length === 0) {
    return (
      <QuietEmpty
        title="No consumers loaded"
        description="Consumer attribution will appear when the control plane returns a linked ledger row."
      />
    );
  }

  return (
    <div className="mt-4 divide-y divide-border">
      {attributedRows.map((attributedRow) => {
        return (
          <div key={attributedRow.id} className="grid gap-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">{attributedRow.consumer_alias}</span>
              <ConsumerStamp tier={attributedRow.tier} />
            </div>
            <p className="text-sm text-muted-foreground">
              {attributedRow.endpoint} · {attributedRow.observation_count} observations across{" "}
              {sessionCount(attributedRow.session_count)}.
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function GateView({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const report = snapshot.replayReport;

  if (!report) {
    return (
      <QuietEmpty
        title="No replay report"
        description="No signed differential replay report has been ingested for this organization."
      />
    );
  }

  const stableCases = report.results.filter((result) => result.stable).length;
  const deltas = sortedDeltas(report);
  const rowsByClaimId = new Map(snapshot.allLedgerRows.map((row) => [row.claim_id, row]));
  const matchedReceiptRow = deltas
    .flatMap(({ delta }) => delta.matches)
    .map((match) => rowsByClaimId.get(match.claim_id))
    .find((row): row is LedgerRow => row?.receipt_id != null);

  return (
    <div className="grid gap-6">
      <EvidenceHeader
        eyebrow="Change gate"
        title={`Deterministic decision: ${report.decision.outcome.toUpperCase()}`}
        description="Replay measures base and candidate images against the same redacted corpus. GPT can explain the impact, but it does not create blocking facts."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app?view=replay" prefetch={false}>
                Replay integrity
              </Link>
            </Button>
            {matchedReceiptRow ? (
              <Button asChild variant="outline">
                <Link
                  href={`/app?view=behavior&entry=${encodeURIComponent(matchedReceiptRow.id)}`}
                  prefetch={false}
                >
                  Matched receipt
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <section className="rounded-md border border-border bg-card">
        <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:p-6">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <OutcomeBadge outcome={report.decision.outcome} />
              <p className="text-sm text-muted-foreground">
                Generated {new Date(report.generated_at).toLocaleString("en-US")}
              </p>
            </div>
            <DecisionCounts report={report} />
            <DecisionReasons reasons={report.decision.reasons} />
          </div>
          <dl className="grid gap-2 text-sm md:min-w-72">
            <MetaRow label="runs" value={report.runs === null ? "not reported" : report.runs} />
            <MetaRow label="stable cases" value={`${stableCases}/${report.results.length}`} />
            <MetaRow label="extractor" value={report.extractor_version} />
            <MetaRow label="corpus" value={shortDigest(report.corpus_digest)} />
            <MetaRow label="policy" value={`v${report.policy_version}`} />
          </dl>
        </div>

        <div className="border-t border-border p-4 md:p-6">
          <h2 className="text-base font-semibold">Measured deltas</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Sorted by matched evidence tier. The signed outcome and counts above are authoritative;
            these rows do not recompute gate effects from tier labels.
          </p>

          {deltas.length === 0 ? (
            <QuietEmpty
              title="No observable behavior changed"
              description="The latest replay report did not produce a stable delta."
            />
          ) : (
            <div className="mt-4 grid gap-4">
              {deltas.map(({ delta, caseId, stable, quarantined }) => (
                <GateDeltaRow
                  key={`${caseId}:${delta.digest}`}
                  caseId={caseId}
                  delta={delta}
                  quarantined={quarantined}
                  snapshot={snapshot}
                  stable={stable}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function GateDeltaRow({
  caseId,
  delta,
  quarantined,
  snapshot,
  stable,
}: {
  caseId: string;
  delta: ReplayDelta;
  quarantined: boolean;
  snapshot: WorkspaceSnapshot;
  stable: boolean;
}) {
  const tier = highestTier(delta.matches.map((match) => match.tier));
  const rowsByClaimId = new Map(snapshot.allLedgerRows.map((row) => [row.claim_id, row]));
  const matchDetails = delta.matches.map((match) => ({
    ...match,
    row: rowsByClaimId.get(match.claim_id) ?? null,
  }));
  const matchedRows = matchDetails
    .map((match) => match.row)
    .filter((row): row is LedgerRow => row !== null);
  const missingMatches = matchDetails.filter((match) => match.row === null);
  const status = deltaStatus(tier, stable, quarantined, delta.matches.length);

  return (
    <article
      aria-labelledby={`delta-${delta.digest}`}
      className="rounded-md border border-border bg-background/55 p-4"
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            {tier ? <TierBadge tier={tier} compact /> : <DeltaStamp symbol="·" label="Note" />}
            <h3 id={`delta-${delta.digest}`} className="text-sm font-semibold">
              {delta.path} · {delta.kind} delta
            </h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{status.detail}</p>
        </div>
        <DeltaStamp symbol={status.symbol} label={status.label} tone={status.tone} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] md:items-stretch">
        <ValuePane label="base" value={delta.before} />
        <GitCompareArrows
          className="mx-auto hidden size-5 self-center text-muted-foreground md:block"
          aria-label="compared with"
        />
        <ValuePane label="candidate" value={delta.after} />
      </div>

      <div className="mt-4 divide-y divide-border border-y text-sm">
        {matchedRows.map((row) => (
          <div
            key={row.claim_id}
            className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <div>
              <p className="font-medium">{row.consumer_alias}</p>
              <p className="text-muted-foreground">{row.impact}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/app?view=behavior&entry=${encodeURIComponent(row.id)}`}
                prefetch={false}
              >
                Open evidence
              </Link>
            </Button>
          </div>
        ))}
        {missingMatches.map((match) => (
          <div key={match.claim_id} className="grid gap-1 py-3">
            <p className="font-medium">Signed replay claim {shortDigest(match.claim_id)}</p>
            <p className="text-muted-foreground">
              This claim is outside the current filtered ledger result. Its tier and receipt stay
              unknown in this view; the signed aggregate decision above remains authoritative.
            </p>
          </div>
        ))}
        {delta.matches.length === 0 ? (
          <p className="py-3 text-muted-foreground">
            No ledger claim matched this delta. Treat it as an unclassified replay note until a
            claim and receipt exist.
          </p>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-xs text-muted-foreground md:grid-cols-3">
        <MetaRow label="case" value={caseId} />
        <MetaRow label="delta digest" value={shortDigest(delta.digest)} />
        <MetaRow
          label="stability"
          value={quarantined ? "quarantined" : stable ? "stable" : "unstable"}
        />
      </dl>
    </article>
  );
}

function EvidenceHeader({
  actions,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0 max-w-4xl">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap gap-2 md:justify-end">{actions}</div>
      ) : null}
    </header>
  );
}

function ReceiptStep({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="border-b p-4 last:border-b-0 md:border-b-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      <p className="mt-2 break-words text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function DecisionCounts({ report }: { report: NonNullable<WorkspaceSnapshot["replayReport"]> }) {
  const counts = [
    { label: "blocks", value: report.decision.block_count, tone: "text-tier-proof" },
    { label: "warnings", value: report.decision.warn_count, tone: "text-tier-pattern" },
    { label: "notes", value: report.decision.note_count, tone: "text-tier-exposure" },
  ];

  return (
    <div className="grid overflow-hidden rounded-md border sm:grid-cols-3 sm:divide-x">
      {counts.map((item) => (
        <div key={item.label} className="border-b p-4 last:border-b-0 sm:border-b-0">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${item.tone}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DecisionReasons({ reasons }: { reasons: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">Decision basis</h2>
      {reasons.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>— {reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          The signed report did not include reason text. Its outcome and counts remain the source of
          truth.
        </p>
      )}
    </div>
  );
}

function ValuePane({ label, value }: { label: string; value: unknown }) {
  return (
    <figure className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3">
      <figcaption className="text-sm font-medium text-muted-foreground">{label}</figcaption>
      <pre className="scrollbar-thin min-h-20 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/70 p-3 font-data text-xs leading-6 text-foreground">
        {formatValue(value)}
      </pre>
    </figure>
  );
}

function ConsumerStamp({ tier }: { tier: EvidenceTier }) {
  if (tier === "T1") return <DeltaStamp symbol="×" label="T1 echo evidence" tone="proof" />;
  if (tier === "T2") return <DeltaStamp symbol="!" label="T2 pattern evidence" tone="pattern" />;
  return <DeltaStamp symbol="○" label="Exposure only" tone="exposure" />;
}

function DeltaStamp({
  label,
  symbol,
  tone = "neutral",
}: {
  label: string;
  symbol: string;
  tone?: "neutral" | "proof" | "pattern" | "exposure" | "success";
}) {
  const toneClass = {
    neutral: "border-border text-muted-foreground",
    proof: "border-tier-proof/45 text-tier-proof",
    pattern: "border-tier-pattern/45 text-tier-pattern",
    exposure: "border-tier-exposure/45 text-tier-exposure",
    success: "border-status-success/45 text-status-success",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-8 items-center gap-2 rounded-md border bg-background/55 px-2.5 py-1 text-xs font-medium ${toneClass}`}
    >
      <span aria-hidden="true" className="font-data text-sm">
        {symbol}
      </span>
      {label}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-data text-xs text-foreground">{value}</dd>
    </div>
  );
}

function MetaTerm({ children }: { children: ReactNode }) {
  return <dt className="text-muted-foreground">{children}</dt>;
}

function MetaValue({ children }: { children: ReactNode }) {
  return <dd className="min-w-0 break-all font-data text-xs text-foreground">{children}</dd>;
}

function QuietEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function excerptToRows(excerpt: unknown) {
  if (excerpt && typeof excerpt === "object" && !Array.isArray(excerpt)) {
    return Object.entries(excerpt).map(([label, value]) => ({ label, value: formatValue(value) }));
  }
  return [{ label: "excerpt", value: formatValue(excerpt) }];
}

function formatValue(value: unknown) {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === undefined) return "not reported";
  return JSON.stringify(value, null, 2);
}

function tierMeaning(tier: EvidenceTier) {
  if (tier === "T1") return "T1 echo evidence";
  if (tier === "T2") return "T2 pattern evidence";
  return "T3 exposure only";
}

function tierExplanation(tier: EvidenceTier) {
  if (tier === "T2") {
    return "Pattern evidence can warn reviewers, but it cannot block a change by default.";
  }
  return "Exposure shows a consumer received the behavior. It is not dependency proof and never blocks.";
}

function sortedDeltas(report: NonNullable<WorkspaceSnapshot["replayReport"]>) {
  return report.results
    .flatMap((result) =>
      result.deltas.map((delta) => ({
        caseId: result.case_id,
        delta,
        stable: result.stable,
        quarantined: result.quarantined,
      })),
    )
    .sort((left, right) => {
      const leftTier = highestTier(left.delta.matches.map((match) => match.tier));
      const rightTier = highestTier(right.delta.matches.map((match) => match.tier));
      return (
        riskRank(leftTier) - riskRank(rightTier) || left.delta.path.localeCompare(right.delta.path)
      );
    });
}

function highestTier(tiers: Array<EvidenceTier | null>) {
  if (tiers.includes("T1")) return "T1";
  if (tiers.includes("T2")) return "T2";
  if (tiers.includes("T3")) return "T3";
  return undefined;
}

function riskRank(tier: EvidenceTier | undefined) {
  if (tier === "T1") return 0;
  if (tier === "T2") return 1;
  if (tier === "T3") return 2;
  return 3;
}

function deltaStatus(
  tier: EvidenceTier | undefined,
  stable: boolean,
  quarantined: boolean,
  matchCount: number,
): {
  label: string;
  symbol: string;
  tone: "neutral" | "proof" | "pattern" | "exposure" | "success";
  detail: string;
} {
  if (quarantined || !stable) {
    return {
      label: "Quarantined",
      symbol: "≈",
      tone: "neutral",
      detail: "Replay did not produce a stable diff, so this row cannot create a blocking fact.",
    };
  }
  if (tier === "T1") {
    return {
      label: "Matched T1 echo",
      symbol: "×",
      tone: "proof",
      detail:
        "This stable delta matched stored T1 echo evidence. See the signed decision above for its actual gate effect.",
    };
  }
  if (tier === "T2") {
    return {
      label: "Matched T2 pattern",
      symbol: "!",
      tone: "pattern",
      detail:
        "This stable delta matched stored T2 pattern evidence. See the signed decision above for its actual gate effect.",
    };
  }
  if (tier === "T3") {
    return {
      label: "Exposure only",
      symbol: "○",
      tone: "exposure",
      detail: "T3 exposure matched this delta. It is not dependency proof and never blocks.",
    };
  }
  if (matchCount > 0) {
    return {
      label: "Matched claim",
      symbol: "?",
      tone: "neutral",
      detail:
        "The signed replay references a claim outside the current filtered ledger result. Its tier is not inferred here.",
    };
  }
  return {
    label: "Unmatched note",
    symbol: "·",
    tone: "neutral",
    detail: "No stored ledger claim matched this replay delta.",
  };
}

function shortDigest(digest: string) {
  return digest.length > 18 ? `${digest.slice(0, 14)}…${digest.slice(-6)}` : digest;
}

function sessionCount(count: number) {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}
