import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireProgressStream,
  MAX_PROGRESS_STREAM_CONNECTIONS,
  startSingleFlightPolling,
} from "./progress-stream";

afterEach(() => vi.useRealTimers());

describe("progress streams", () => {
  it("bounds concurrent connections and releases capacity once", () => {
    const releases = Array.from({ length: MAX_PROGRESS_STREAM_CONNECTIONS }, () =>
      acquireProgressStream(),
    );
    expect(releases.every(Boolean)).toBe(true);
    expect(acquireProgressStream()).toBeNull();

    for (const release of releases) {
      release?.();
      release?.();
    }
    const finalRelease = acquireProgressStream();
    expect(finalRelease).not.toBeNull();
    finalRelease?.();
  });

  it("never overlaps polls", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const poll = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const stop = startSingleFlightPolling(poll, vi.fn(), 10);

    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(poll).toHaveBeenCalledTimes(1);
    finish?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
  });
});
