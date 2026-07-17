import type { ProgressEventTopic } from "@hyrum/api-client";
import { createControlPlane } from "@/services/control-plane";
import {
  assertions as demoAssertions,
  consumers as demoConsumers,
  in90Days as demoDefaultAssertionExpiry,
  gatePolicy as demoGatePolicy,
  ledgerRows as demoLedgerRows,
  progressEvents as demoProgressEvents,
  receipts as demoReceipts,
  replayReport as demoReplayReport,
} from "@/services/workspace-demo-data";

export type EvidenceTier = "T1" | "T2" | "T3";
export type BehaviorKind = "shape" | "ordering" | "error" | "status";
export type LedgerState = "active" | "stale" | "dismissed";

export type Consumer = {
  id: string;
  stable_id: string;
  display_alias: string;
  last_seen_at: string | null;
};

export type LedgerEntry = {
  id: string;
  claim_id: string;
  behavior_id: string;
  consumer_id: string;
  operation_id: string | null;
  kind: BehaviorKind;
  tier: EvidenceTier;
  state: LedgerState;
  title: string;
  last_seen_at: string;
  freshness_until: string;
  receipt_id: string | null;
};

export type Receipt = {
  id: string;
  behavior_id: string | null;
  consumer_id: string | null;
  operation_id: string | null;
  object_key: string | null;
  digest: string;
  redaction_version: string;
  sequence_start: number;
  sequence_end: number;
  excerpt: unknown;
  expires_at: string;
};

export type Assertion = {
  id: string;
  behavior_id: string;
  claim_id: string | null;
  owner_id: string;
  reason: string;
  status: "active" | "expired" | "resolved";
  expires_at: string;
};

export type GatePolicy = {
  id: string;
  version: number;
  block_tiers: EvidenceTier[];
  warn_tiers: EvidenceTier[];
  active: boolean;
};

export type ProgressEvent = {
  id: number;
  organization_id: string;
  topic: ProgressEventTopic;
  resource_id: string | null;
  payload: unknown;
  created_at: string;
};

export type ReplayDelta = {
  kind: BehaviorKind;
  path: string;
  before?: unknown;
  after?: unknown;
  digest: string;
  matches: Array<{ claim_id: string; tier: EvidenceTier }>;
};

export type ReplayAssertionResult = {
  assertion_id: string;
  behavior_id: string;
  claim_id: string | null;
  case_id: string;
  outcome: "pass" | "fail";
};

export type ReplayReport = {
  id?: string;
  generated_at: string;
  base_url: string;
  candidate_url: string;
  base_image_digest: string;
  candidate_image_digest: string;
  extractor_version: string;
  corpus_digest: string;
  runs: number | null;
  results: Array<{
    case_id: string;
    stable: boolean;
    quarantined: boolean;
    deltas: ReplayDelta[];
  }>;
  decision: {
    outcome: "pass" | "warn" | "block";
    block_count: number;
    warn_count: number;
    note_count: number;
    reasons: string[];
  };
  assertion_results: ReplayAssertionResult[];
};

export type FilterState = {
  query: string;
  selectedId: string | null;
  tier: "all" | EvidenceTier;
  kind: "all" | LedgerEntry["kind"];
  state: "all" | LedgerEntry["state"];
};

export type LedgerRow = LedgerEntry & {
  endpoint: string;
  consumer_alias: string;
  consumer_stable_id: string;
  impact: string;
  evidence_summary: string;
  owner: string;
  receipt_digest: string | null;
};

export type WorkspaceSnapshot = {
  apiStatus: "ok" | "degraded" | "unavailable";
  dataMode: "live" | "demo";
  dataErrors: string[];
  role: "owner" | "admin" | "engineer" | "viewer";
  permissions: {
    canPinAssertion: boolean;
    reason: string | null;
  };
  filters: FilterState;
  consumers: Consumer[];
  allLedgerRows: LedgerRow[];
  ledgerRows: LedgerRow[];
  selected: LedgerRow | null;
  receipt: Receipt | null;
  assertions: Assertion[];
  gatePolicy: GatePolicy | null;
  replayReport: ReplayReport | null;
  progressEvents: ProgressEvent[];
  defaultAssertionExpiry: string;
  metrics: {
    precision: number;
    recall: number;
    stability: number;
    labeledCases: number;
  } | null;
};

type WorkspaceApi = {
  health(): Promise<{ status: "ok" | "degraded" }>;
  session(): Promise<{ role: WorkspaceSnapshot["role"] }>;
  listLedger(): Promise<LedgerEntry[]>;
  listConsumers(): Promise<Consumer[]>;
  getReceipt(id: string): Promise<Receipt>;
  listAssertions(): Promise<Assertion[]>;
  getPolicy(): Promise<GatePolicy>;
  getLatestReplayRun(): Promise<ReplayRunDetail>;
};

type ReplayRunDetail = {
  id: string;
  generated_at: string;
  base_url: string;
  candidate_url: string;
  base_image_digest: string;
  candidate_image_digest: string;
  extractor_version: string;
  corpus_digest: string;
  decision: ReplayReport["decision"];
  deltas: Array<
    Omit<ReplayDelta, "matches"> & {
      case_id: string;
      stable: boolean;
      quarantined: boolean;
      matches: Array<{ claim_id: string; tier?: EvidenceTier }>;
    }
  >;
  assertion_results: ReplayAssertionResult[];
};

type WorkspaceDataOptions = {
  accessToken?: string;
  demoMode?: boolean;
  client?: WorkspaceApi;
};

export function parseFilters(searchParams: URLSearchParams): FilterState {
  const tier = searchParams.get("tier");
  const kind = searchParams.get("kind");
  const state = searchParams.get("state");

  return {
    query: searchParams.get("q")?.trim() ?? "",
    selectedId: searchParams.get("entry"),
    tier: tier === "T1" || tier === "T2" || tier === "T3" ? tier : "all",
    kind:
      kind === "shape" || kind === "ordering" || kind === "error" || kind === "status"
        ? kind
        : "all",
    state: state === "active" || state === "stale" || state === "dismissed" ? state : "all",
  };
}

export async function getWorkspaceSnapshot(
  filters: FilterState,
  options: WorkspaceDataOptions = {},
): Promise<WorkspaceSnapshot> {
  if (options.demoMode) return getDemoWorkspaceSnapshot(filters);

  const client: WorkspaceApi = options.client ?? createControlPlane(options.accessToken);
  const [
    healthResult,
    sessionResult,
    ledgerResult,
    consumersResult,
    assertionsResult,
    policyResult,
    replayResult,
  ] = await Promise.allSettled([
    client.health(),
    client.session(),
    client.listLedger(),
    client.listConsumers(),
    client.listAssertions(),
    client.getPolicy(),
    client.getLatestReplayRun(),
  ]);
  const dataErrors = [
    failureMessage("Health", healthResult),
    failureMessage("Session", sessionResult),
    failureMessage("Ledger", ledgerResult),
    failureMessage("Consumers", consumersResult),
    failureMessage("Assertions", assertionsResult),
    failureMessage("Policy", policyResult),
    failureMessage("Replay", replayResult),
  ].filter((message): message is string => message !== null);
  const liveConsumers = fulfilledValue(consumersResult) ?? [];
  const consumerById = new Map(liveConsumers.map((consumer) => [consumer.id, consumer]));
  const liveRows = (fulfilledValue(ledgerResult) ?? []).map((entry) =>
    toLedgerRow(entry, consumerById.get(entry.consumer_id)),
  );
  const selectedRows = filterLedgerRows(filters, liveRows);
  const selected = liveRows.find((row) => row.id === filters.selectedId) ?? selectedRows[0] ?? null;
  let receipt: Receipt | null = null;

  if (selected?.receipt_id) {
    try {
      receipt = await client.getReceipt(selected.receipt_id);
      selected.receipt_digest = receipt.digest;
      selected.evidence_summary = `Redacted receipt ${receipt.digest}; sequence ${receipt.sequence_start}-${receipt.sequence_end}.`;
    } catch (error) {
      dataErrors.push(`Receipt: ${safeErrorMessage(error)}`);
    }
  }

  const coreDataUnavailable =
    ledgerResult.status === "rejected" && consumersResult.status === "rejected";
  const apiStatus =
    healthResult.status === "rejected" || coreDataUnavailable
      ? "unavailable"
      : dataErrors.length > 0 || healthResult.value.status === "degraded"
        ? "degraded"
        : "ok";

  const session = fulfilledValue(sessionResult);
  const canPinAssertion =
    session?.role === "owner" || session?.role === "admin" || session?.role === "engineer";

  return {
    apiStatus,
    dataMode: "live",
    dataErrors,
    role: session?.role ?? "viewer",
    permissions: {
      canPinAssertion,
      reason: canPinAssertion ? null : "Your Hyrum organization role cannot pin assertions.",
    },
    filters,
    consumers: liveConsumers,
    allLedgerRows: liveRows,
    ledgerRows: selectedRows,
    selected,
    receipt,
    assertions: fulfilledValue(assertionsResult) ?? [],
    gatePolicy: fulfilledValue(policyResult),
    replayReport: toReplayReport(fulfilledValue(replayResult), liveRows),
    progressEvents: [],
    defaultAssertionExpiry: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    metrics: null,
  };
}

function toReplayReport(run: ReplayRunDetail | null, rows: LedgerRow[] = []): ReplayReport | null {
  if (!run) return null;
  const results = new Map<string, ReplayReport["results"][number]>();
  const tierByClaimId = new Map(rows.map((row) => [row.claim_id, row.tier]));
  for (const delta of run.deltas) {
    const result = results.get(delta.case_id) ?? {
      case_id: delta.case_id,
      stable: delta.stable,
      quarantined: delta.quarantined,
      deltas: [],
    };
    result.deltas.push({
      kind: delta.kind,
      path: delta.path,
      before: delta.before,
      after: delta.after,
      digest: delta.digest,
      matches: delta.matches.flatMap((match) => {
        const tier = match.tier ?? tierByClaimId.get(match.claim_id);
        return tier ? [{ claim_id: match.claim_id, tier }] : [];
      }),
    });
    results.set(delta.case_id, result);
  }
  return {
    id: run.id,
    generated_at: run.generated_at,
    base_url: run.base_url,
    candidate_url: run.candidate_url,
    base_image_digest: run.base_image_digest,
    candidate_image_digest: run.candidate_image_digest,
    extractor_version: run.extractor_version,
    corpus_digest: run.corpus_digest,
    runs: null,
    results: [...results.values()],
    decision: run.decision,
    assertion_results: run.assertion_results,
  };
}

function getDemoWorkspaceSnapshot(filters: FilterState): WorkspaceSnapshot {
  const selectedRows = filterLedgerRows(filters, demoLedgerRows);
  const selected =
    demoLedgerRows.find((row) => row.id === filters.selectedId) ?? selectedRows[0] ?? null;

  return {
    apiStatus: "ok",
    dataMode: "demo",
    dataErrors: [],
    role: "engineer",
    permissions: { canPinAssertion: true, reason: null },
    filters,
    consumers: demoConsumers,
    allLedgerRows: demoLedgerRows,
    ledgerRows: selectedRows,
    selected,
    receipt: demoReceipts.find((item) => item.id === selected?.receipt_id) ?? null,
    assertions: demoAssertions,
    gatePolicy: demoGatePolicy,
    replayReport: demoReplayReport,
    progressEvents: demoProgressEvents,
    defaultAssertionExpiry: demoDefaultAssertionExpiry,
    metrics: { precision: 0.97, recall: 0.91, stability: 0.997, labeledCases: 128 },
  };
}

function toLedgerRow(entry: LedgerEntry, consumer?: Consumer): LedgerRow {
  const shortOperation = entry.operation_id?.slice(0, 8);
  const shortConsumer = entry.consumer_id.slice(0, 8);
  const impact =
    entry.tier === "T1"
      ? "Proven echo dependency. A matching deterministic replay delta can block."
      : entry.tier === "T2"
        ? "Pattern evidence warns but does not block."
        : "Exposure only. It is not labeled as a dependency and never blocks.";

  return {
    ...entry,
    endpoint: shortOperation ? `Operation ${shortOperation}` : "Unscoped operation",
    consumer_alias: consumer?.display_alias ?? `Consumer ${shortConsumer}`,
    consumer_stable_id: consumer?.stable_id ?? entry.consumer_id,
    impact,
    evidence_summary: entry.receipt_id
      ? "Redacted receipt is available for this behavior."
      : "No receipt is attached to this ledger entry.",
    owner: "Unassigned",
    receipt_digest: null,
  };
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function failureMessage<T>(label: string, result: PromiseSettledResult<T>): string | null {
  return result.status === "rejected" ? `${label}: ${safeErrorMessage(result.reason)}` : null;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Control plane request failed";
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}

function filterLedgerRows(filters: FilterState, rows: LedgerRow[]) {
  const query = filters.query.toLowerCase();
  return rows.filter((row) => {
    const matchesQuery =
      query.length === 0 ||
      [
        row.title,
        row.endpoint,
        row.consumer_alias,
        row.consumer_stable_id,
        row.evidence_summary,
      ].some((value) => value.toLowerCase().includes(query));
    return (
      matchesQuery &&
      (filters.tier === "all" || row.tier === filters.tier) &&
      (filters.kind === "all" || row.kind === filters.kind) &&
      (filters.state === "all" || row.state === filters.state)
    );
  });
}
