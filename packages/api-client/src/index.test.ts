import { describe, expect, it, vi } from "vitest";
import { createControlPlaneClient } from "./index";

describe("model advisory client", () => {
  it("allows the model request up to 15 seconds", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(signal);
      return Response.json({
        role: "behavior_clusters",
        run_id: "10000000-0000-4000-8000-000000000001",
        model: "gpt-5.6",
        prompt_version: "behavior-clusters-v1",
        result: {},
      });
    });

    await createControlPlaneClient({
      baseUrl: "https://control.example.test",
      fetch,
    }).runModelAdvisory("behavior_clusters", ["20000000-0000-4000-8000-000000000001"]);

    expect(timeout).toHaveBeenCalledWith(15_000);
  });
});
