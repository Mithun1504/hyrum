import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WorkspaceSnapshot } from "@/services/workspace-data";

vi.mock("@/app/(dashboard)/app/actions", () => ({
  runModelAdvisoryAction: vi.fn(),
}));

import { ModelAdvisoryWorkbench } from "./model-advisory-workbench";

describe("ModelAdvisoryWorkbench", () => {
  it("explains why an empty tenant cannot run an advisory", () => {
    render(
      <TooltipProvider>
        <ModelAdvisoryWorkbench snapshot={emptySnapshot()} />
      </TooltipProvider>,
    );

    const button = screen.getByRole("button", { name: "Run advisory" });
    expect(button).toBeDisabled();
    const trigger = button.closest("[data-slot='tooltip-trigger']");
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute(
      "title",
      "Capture receipt-backed behavior or curate an enabled replay case first.",
    );
  });
});

function emptySnapshot(): WorkspaceSnapshot {
  return {
    apiStatus: "ok",
    dataMode: "live",
    dataErrors: [],
    role: "viewer",
    summary: null,
    permissions: {
      canPinAssertion: false,
      canOverrideClaim: false,
      canManagePolicy: false,
      canManageCorpus: false,
      reason: "Your Hyrum organization role cannot pin assertions.",
    },
    filters: { query: "", selectedId: null, tier: "all", kind: "all", state: "all" },
    consumers: [],
    allLedgerRows: [],
    ledgerRows: [],
    selected: null,
    receipt: null,
    assertions: [],
    gatePolicy: null,
    replayCorpora: [],
    replayReport: null,
    progressEvents: [],
    defaultAssertionExpiry: "2026-10-17T00:00:00.000Z",
  };
}
