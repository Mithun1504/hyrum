import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/app/actions", () => ({
  addReplayCorpusItemAction: vi.fn(),
  createReplayCorpusAction: vi.fn(),
  prepareCorpusUploadAction: vi.fn(),
  updateReplayCorpusStatusAction: vi.fn(),
}));

import { CorpusManager } from "./corpus-manager";

describe("CorpusManager", () => {
  it("disables the draft form for a read-only member", () => {
    render(<CorpusManager corpora={[]} canManage={false} />);

    expect(screen.getByRole("button", { name: "Create draft corpus" })).toBeDisabled();
    expect(screen.getByLabelText("Version")).toBeDisabled();
    expect(
      screen.getByText("Owner, admin, or engineer access is required to curate corpora."),
    ).toBeVisible();
  });
});
