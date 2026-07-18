import {
  Activity,
  AlertOctagon,
  Boxes,
  ListFilter,
  Network,
  Pin,
  RadioTower,
  ShieldCheck,
  Workflow,
} from "lucide-react";

export type ViewKey =
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
  { key: "capture", label: "Capture", shortLabel: "Capture", icon: RadioTower, group: "Discover" },
  { key: "ledger", label: "Ledger", shortLabel: "Ledger", icon: ListFilter, group: "Discover" },
  { key: "behavior", label: "Behavior", shortLabel: "Behavior", icon: Workflow, group: "Discover" },
  {
    key: "consumers",
    label: "Consumers",
    shortLabel: "Consumers",
    icon: Network,
    group: "Discover",
  },
  { key: "endpoints", label: "Endpoints", shortLabel: "Endpoints", icon: Boxes, group: "Discover" },
  {
    key: "gate",
    label: "Change gate",
    shortLabel: "Gate",
    icon: AlertOctagon,
    group: "Change control",
  },
  {
    key: "assertions",
    label: "Assertions",
    shortLabel: "Assertions",
    icon: Pin,
    group: "Change control",
  },
  {
    key: "replay",
    label: "Replay health",
    shortLabel: "Replay",
    icon: Activity,
    group: "Change control",
  },
  { key: "policy", label: "Policy", shortLabel: "Policy", icon: ShieldCheck, group: "Settings" },
] satisfies Array<{
  key: ViewKey;
  label: string;
  shortLabel: string;
  icon: typeof Activity;
  group: string;
}>;
