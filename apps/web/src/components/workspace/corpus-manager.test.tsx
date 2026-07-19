import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/app/actions", () => ({
  addReplayCorpusItemAction: vi.fn(),
  createReplayCorpusAction: vi.fn(),
  uploadCorpusArtifactAction: vi.fn(),
  updateReplayCorpusStatusAction: vi.fn(),
}));

import { uploadCorpusArtifactAction } from "@/app/(dashboard)/app/actions";
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

  it("enables corpus creation only after both required artifacts upload", async () => {
    vi.mocked(uploadCorpusArtifactAction)
      .mockResolvedValueOnce({
        status: "success",
        objectKey: "org/replay-corpus/archive",
        digest: `sha256:${"a".repeat(64)}`,
      })
      .mockResolvedValueOnce({
        status: "success",
        objectKey: "org/replay-fixture/database",
        digest: `sha256:${"b".repeat(64)}`,
      });
    const { container } = render(<CorpusManager corpora={[]} canManage />);
    const submit = screen.getByRole("button", { name: "Create draft corpus" });
    const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const [archiveInput, fixtureInput] = fileInputs;
    if (!archiveInput || !fixtureInput) throw new Error("Expected required corpus file inputs");

    expect(submit).toBeDisabled();
    fireEvent.change(archiveInput, {
      target: { files: [new File(["archive"], "corpus.json", { type: "application/json" })] },
    });
    await waitFor(() => expect(uploadCorpusArtifactAction).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();

    fireEvent.change(fixtureInput, {
      target: { files: [new File(["fixture"], "fixture.sql", { type: "text/plain" })] },
    });
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("shows one actionable upload error and keeps corpus creation disabled", async () => {
    vi.mocked(uploadCorpusArtifactAction).mockResolvedValueOnce({
      status: "error",
      message: "Artifact upload failed. Retry the file in a moment.",
    });
    const { container } = render(<CorpusManager corpora={[]} canManage />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("Expected a corpus file input");

    fireEvent.change(fileInput, {
      target: { files: [new File(["archive"], "corpus.json", { type: "application/json" })] },
    });

    expect(
      await screen.findByText("Artifact upload failed. Retry the file in a moment."),
    ).toBeVisible();
    expect(screen.getAllByText("Artifact upload failed. Retry the file in a moment.")).toHaveLength(
      1,
    );
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create draft corpus" })).toBeDisabled();
  });
});
