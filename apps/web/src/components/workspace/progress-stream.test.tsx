import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressStream } from "./progress-stream";

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
    expect(source?.url).toBe("/api/progress");
    act(() => {
      source?.dispatchEvent(
        new MessageEvent("capture.batch_ingested", {
          data: JSON.stringify({ accepted: 12 }),
          lastEventId: "42",
        }),
      );
    });

    expect(screen.getByText("capture.batch_ingested")).toBeVisible();
  });
});
