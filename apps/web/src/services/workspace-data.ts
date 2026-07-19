import { ControlPlaneError, type ProgressEventTopic } from "@hyrum/api-client";
import type { AssertionListItem, ReplayCorpus, ReplayRunDetailResponse } from "@hyrum/contracts";
import { createControlPlane } from "@/services/control-plane";

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
  endpoint: string;
  consumer_alias: string;
  consumer_stable_id: string;
  observation_count: number;
  session_count: number;
  owner: string | null;
  receipt_digest: string | null;
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

export type Assertion = AssertionListItem;

export type GatePolicy = {
  id: string;
  version: number;
  block_tiers: Array<Extract<EvidenceTier, "T1">>;
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
  matches: Array<{ claim_id: string; tier: EvidenceTier | null }>;
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
  fixture_digest: string;
  mask_digest: string;
  runner_version: string;
  policy_id: string;
  policy_version: number;
  runs: number | null;
  outcome: "pass" | "warn" | "block";
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
  impact: string;
  evidence_summary: string;
};

export type WorkspaceSummary = {
  organization: {
    id: string;
    name: string;
    region: string;
    retention_days: number;
  };
  capture: {
    endpoint_count: number;
    consumer_count: number;
    sessions_24h: number;
    evidence_events_24h: number;
  };
};

export type WorkspaceSnapshot = {
  apiStatus: "ok" | "degraded" | "unavailable";
  dataMode: "live";
  dataErrors: string[];
  role: "owner" | "admin" | "engineer" | "viewer";
  summary: WorkspaceSummary | null;
  permissions: {
    canPinAssertion: boolean;
    canOverrideClaim: boolean;
    canManagePolicy: boolean;
    canManageCorpus: boolean;
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
  replayCorpora: ReplayCorpus[];
  replayReport: ReplayReport | null;
  progressEvents: ProgressEvent[];
  defaultAssertionExpiry: string;
};

type WorkspaceApi = {
  health(): Promise<{ status: "ok" | "degraded" }>;
  session(): Promise<{ role: WorkspaceSnapshot["role"] }>;
  listLedger(query?: {
    q?: string;
    tier?: EvidenceTier;
    kind?: BehaviorKind;
    state?: LedgerState;
  }): Promise<{ entries: LedgerEntry[]; next_cursor: null; total: number }>;
  listConsumers(): Promise<{
    consumers: Consumer[];
    next_cursor: null;
    total: number;
  }>;
  getReceipt(id: string): Promise<Receipt>;
  listAssertions(): Promise<Assertion[]>;
  getPolicy(): Promise<GatePolicy>;
  listReplayCorpora(): Promise<ReplayCorpus[]>;
  getLatestReplayRun(): Promise<ReplayRunDetail>;
  getReplayRun?(id: string): Promise<ReplayRunDetail>;
  getWorkspaceSummary(): Promise<WorkspaceSummary>;
  listProgressEvents(limit?: number): Promise<ProgressEvent[]>;
};

type ReplayRunDetail = ReplayRunDetailResponse;

type WorkspaceDataOptions = {
  accessToken?: string;
  client?: WorkspaceApi;
  replayRunId?: string;
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
  const client: WorkspaceApi = options.client ?? createControlPlane(options.accessToken);
  const [
    healthResult,
    sessionResult,
    ledgerResult,
    consumersResult,
    assertionsResult,
    policyResult,
    replayResult,
    summaryResult,
    progressResult,
    corporaResult,
  ] = await Promise.allSettled([
    client.health(),
    client.session(),
    client.listLedger({
      ...(filters.query ? { q: filters.query } : {}),
      ...(filters.tier !== "all" ? { tier: filters.tier } : {}),
      ...(filters.kind !== "all" ? { kind: filters.kind } : {}),
      ...(filters.state !== "all" ? { state: filters.state } : {}),
    }),
    client.listConsumers(),
    client.listAssertions(),
    client.getPolicy(),
    options.replayRunId && client.getReplayRun
      ? client.getReplayRun(options.replayRunId)
      : client.getLatestReplayRun(),
    client.getWorkspaceSummary(),
    client.listProgressEvents(20),
    client.listReplayCorpora(),
  ]);
  const dataErrors = [
    failureMessage("Health", healthResult),
    failureMessage("Session", sessionResult),
    failureMessage("Ledger", ledgerResult),
    failureMessage("Consumers", consumersResult),
    failureMessage("Assertions", assertionsResult),
    optionalFailureMessage("Policy", policyResult),
    replayFailureMessage(replayResult, options.replayRunId !== undefined),
    failureMessage("Workspace summary", summaryResult),
    failureMessage("Progress", progressResult),
    failureMessage("Replay corpora", corporaResult),
  ].filter((message): message is string => message !== null);
  const liveConsumers = fulfilledValue(consumersResult)?.consumers ?? [];
  const liveRows = (fulfilledValue(ledgerResult)?.entries ?? []).map(toLedgerRow);
  const selectedRows = liveRows;
  const selected = liveRows.find((row) => row.id === filters.selectedId) ?? liveRows[0] ?? null;
  let receipt: Receipt | null = null;

  if (selected?.receipt_id) {
    try {
      receipt = await client.getReceipt(selected.receipt_id);
      selected.receipt_digest = receipt.digest;
      selected.evidence_summary = `Redacted receipt ${receipt.digest}; sequence ${receipt.sequence_start}-${receipt.sequence_end}.`;
    } catch (error) {
      if (!isNotFound(error)) dataErrors.push(`Receipt: ${safeErrorMessage(error)}`);
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
  const canOverrideClaim = canPinAssertion;
  const canManagePolicy = session?.role === "owner" || session?.role === "admin";

  return {
    apiStatus,
    dataMode: "live",
    dataErrors,
    role: session?.role ?? "viewer",
    summary: fulfilledValue(summaryResult),
    permissions: {
      canPinAssertion,
      canOverrideClaim,
      canManagePolicy,
      canManageCorpus: canPinAssertion,
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
    replayCorpora: fulfilledValue(corporaResult) ?? [],
    replayReport: toReplayReport(fulfilledValue(replayResult), liveRows),
    progressEvents: fulfilledValue(progressResult) ?? [],
    defaultAssertionExpiry: new Date(Date.now() + 90 * 86_400_000).toISOString(),
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
      matches: delta.matches.map((match) => ({
        claim_id: match.claim_id,
        tier: tierByClaimId.get(match.claim_id) ?? null,
      })),
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
    fixture_digest: run.fixture_digest,
    mask_digest: run.mask_digest,
    runner_version: run.runner_version,
    policy_id: run.policy_id,
    policy_version: run.policy_version,
    runs: run.runs,
    outcome: run.outcome,
    results: [...results.values()],
    decision: run.decision,
    assertion_results: run.assertion_results,
  };
}

function toLedgerRow(entry: LedgerEntry): LedgerRow {
  const impact =
    entry.tier === "T1"
      ? "Proven echo dependency. A matching deterministic replay delta can block."
      : entry.tier === "T2"
        ? "Pattern evidence warns but does not block."
        : "Exposure only. It is not labeled as a dependency and never blocks.";

  return {
    ...entry,
    impact,
    evidence_summary: `${entry.observation_count} observations across ${entry.session_count} captured sessions${entry.receipt_digest ? `; receipt ${entry.receipt_digest}` : "; no active receipt"}.`,
  };
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function failureMessage<T>(label: string, result: PromiseSettledResult<T>): string | null {
  return result.status === "rejected" ? `${label}: ${safeErrorMessage(result.reason)}` : null;
}

function optionalFailureMessage<T>(label: string, result: PromiseSettledResult<T>): string | null {
  return result.status === "rejected" && !isNotFound(result.reason)
    ? `${label}: ${safeErrorMessage(result.reason)}`
    : null;
}

function replayFailureMessage<T>(result: PromiseSettledResult<T>, explicitlyRequested: boolean) {
  if (result.status === "fulfilled") return null;
  if (!isNotFound(result.reason)) return `Replay: ${safeErrorMessage(result.reason)}`;
  return explicitlyRequested
    ? "Replay: Linked replay run was not found or is unavailable to this organization."
    : null;
}

function isNotFound(error: unknown) {
  return error instanceof ControlPlaneError && error.problem.status === 404;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Control plane request failed";
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}
