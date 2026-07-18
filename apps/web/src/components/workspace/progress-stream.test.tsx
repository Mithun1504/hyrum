import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressStream } from "./progress-stream";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const NativeEventSource = globalThis.EventSource;

class MockEventSource extends EventTarget {
  static instances: MockEventSource[] = [];
  onerror: ((event: Event) => void) | null = null;

  constructor(public readonly url: string | URL) {
    super();
    MockEventSource.instances.push(this);
  }

  close() {}
}

afterEach(() => {
  globalThis.EventSource = NativeEventSource;
  MockEventSource.instances = [];
});

describe("ProgressStream", () => {
  it("renders the aligned capture batch topic from EventSource", () => {
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
    render(<ProgressStream initialEvents={[]} live />);

    const source = MockEventSource.instances[0];
    expect(source?.url).toBe("/api/progress?last_event_id=0");
    act(() => {
      source?.dispatchEvent(
        new MessageEvent("capture.batch_ingested", {
          data: JSON.stringify({
            resource_id: "batch-42",
            created_at: "2026-07-18T12:00:00.000Z",
          }),
          lastEventId: "42",
        }),
      );
    });

    expect(screen.getByText("capture.batch_ingested")).toBeVisible();
  });
});
