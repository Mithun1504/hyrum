export type ViewKey =
  | "overview"
  | "capture"
  | "ledger"
  | "consumers"
  | "endpoints"
  | "behavior"
  | "gate"
  | "assertions"
  | "replay"
  | "policy";

export const workspaceNavItems = [
  { key: "overview", label: "Overview", shortLabel: "Overview", group: "Start", step: "00" },
  { key: "capture", label: "Capture", shortLabel: "Capture", group: "Workflow", step: "01" },
  { key: "ledger", label: "Ledger", shortLabel: "Ledger", group: "Workflow", step: "02" },
  {
    key: "gate",
    label: "Change gate",
    shortLabel: "Gate",
    group: "Workflow",
    step: "03",
  },
  {
    key: "assertions",
    label: "Assertions",
    shortLabel: "Assertions",
    group: "Workflow",
    step: "04",
  },
  {
    key: "consumers",
    label: "Consumers",
    shortLabel: "Consumers",
    group: "Investigate",
    step: "A",
  },
  {
    key: "endpoints",
    label: "Endpoints",
    shortLabel: "Endpoints",
    group: "Investigate",
    step: "B",
  },
  {
    key: "replay",
    label: "Replay integrity",
    shortLabel: "Replay",
    group: "System",
    step: "R",
  },
  { key: "policy", label: "Policy", shortLabel: "Policy", group: "System", step: "P" },
] satisfies Array<{
  key: Exclude<ViewKey, "behavior">;
  label: string;
  shortLabel: string;
  group: string;
  step: string;
}>;

export const contextualWorkspaceViews = [
  { key: "behavior", label: "Behavior evidence" },
] satisfies Array<{
  key: Extract<ViewKey, "behavior">;
  label: string;
}>;

export const mobilePrimaryNavKeys = [
  "overview",
  "ledger",
  "gate",
  "assertions",
] satisfies ViewKey[];

export function isWorkspaceViewKey(value: string | undefined): value is ViewKey {
  return (
    workspaceNavItems.some((item) => item.key === value) ||
    contextualWorkspaceViews.some((item) => item.key === value)
  );
}
