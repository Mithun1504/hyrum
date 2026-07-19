import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const prepareCorpusUpload = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/dashboard-auth", () => ({
  dashboardAuth: vi.fn().mockResolvedValue({ accessToken: "test-token" }),
}));
vi.mock("@/services/control-plane", () => ({
  controlPlaneBaseUrl: "https://control-plane.test",
  createControlPlane: () => ({ prepareCorpusUpload }),
}));

import { uploadCorpusArtifactAction } from "./actions";

afterEach(() => {
  prepareCorpusUpload.mockReset();
  vi.unstubAllGlobals();
});

describe("uploadCorpusArtifactAction", () => {
  it("uploads through the server without returning the presigned URL", async () => {
    const contents = "redacted corpus";
    const digest = `sha256:${createHash("sha256").update(contents).digest("hex")}`;
    prepareCorpusUpload.mockResolvedValue({
      object_key: "org/replay-corpus/artifact",
      upload_url: "https://storage.test/presigned-secret",
      headers: { "content-type": "application/json" },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("file", new File([contents], "corpus.json", { type: "application/json" }));

    const result = await uploadCorpusArtifactAction(formData);

    expect(result).toEqual({
      status: "success",
      objectKey: "org/replay-corpus/artifact",
      digest,
    });
    expect(prepareCorpusUpload).toHaveBeenCalledWith({
      sha256: digest,
      size_bytes: contents.length,
      content_type: "application/json",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.test/presigned-secret",
      expect.objectContaining({ method: "PUT", body: Buffer.from(contents) }),
    );
    expect(JSON.stringify(result)).not.toContain("presigned-secret");
  });

  it("rejects artifacts above the server action limit before preparing an upload", async () => {
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(3 * 1024 * 1024 + 1)], "too-large.bin"));

    await expect(uploadCorpusArtifactAction(formData)).resolves.toEqual({
      status: "error",
      message: "Artifact uploads are limited to 3 MB.",
    });
    expect(prepareCorpusUpload).not.toHaveBeenCalled();
  });

  it("returns one actionable error when storage rejects the upload", async () => {
    prepareCorpusUpload.mockResolvedValue({
      object_key: "org/replay-corpus/artifact",
      upload_url: "https://storage.test/presigned-secret",
      headers: {},
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const formData = new FormData();
    formData.set("file", new File(["redacted corpus"], "corpus.json"));

    await expect(uploadCorpusArtifactAction(formData)).resolves.toEqual({
      status: "error",
      message: "Artifact upload failed. Retry the file in a moment.",
    });
  });
});
