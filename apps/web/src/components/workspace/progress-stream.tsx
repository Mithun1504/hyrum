"use client";

import { progressEventTopics } from "@hyrum/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ProgressEvent } from "@/services/workspace-data";

type DisplayEvent = Pick<ProgressEvent, "topic" | "resource_id" | "created_at"> & { id: string };

export function ProgressStream({
  initialEvents,
  live,
}: {
  initialEvents: ProgressEvent[];
  live: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [events, setEvents] = useState<DisplayEvent[]>(
    initialEvents
      .map((event) => ({
        id: String(event.id),
        topic: event.topic,
        resource_id: event.resource_id,
        created_at: event.created_at,
      }))
      .slice(-8),
  );
  const [streamUnavailable, setStreamUnavailable] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    if (!live) return;

    const lastEventId = initialEvents.at(-1)?.id ?? 0;
    const source = new EventSource(`/api/progress?last_event_id=${lastEventId}`);
    const listeners = progressEventTopics.map((topic) => {
      const listener = (event: MessageEvent<string>) => {
        const id = event.lastEventId || crypto.randomUUID();
        const parsed = parseProgressData(event.data);
        if (!parsed) return;
        setEvents((current) =>
          [
            ...current.filter((item) => item.id !== id),
            {
              id,
              topic,
              resource_id: parsed.resource_id,
              created_at: parsed.created_at,
            },
          ].slice(-8),
        );
        setStreamUnavailable(false);
        setStreamConnected(true);
        startTransition(() => router.refresh());
      };
      source.addEventListener(topic, listener as EventListener);
      return { topic, listener };
    });
    source.onopen = () => {
      setStreamUnavailable(false);
      setStreamConnected(true);
    };
    source.onerror = () => {
      setStreamUnavailable(true);
      setStreamConnected(false);
    };

    return () => {
      for (const { topic, listener } of listeners) {
        source.removeEventListener(topic, listener as EventListener);
      }
      source.close();
    };
  }, [initialEvents, live, router]);

  return (
    <section
      className="mt-5 overflow-hidden rounded-md border bg-card"
      aria-labelledby="activity-title"
    >
      <div className="flex min-h-11 items-center gap-3 border-b px-4 py-2.5">
        <h2 id="activity-title" className="text-sm font-semibold">
          Recent activity
        </h2>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={
              live && streamConnected && !streamUnavailable
                ? "size-1.5 bg-status-success"
                : "size-1.5 bg-muted-foreground"
            }
            aria-hidden="true"
          />
          {live
            ? streamUnavailable
              ? "Reconnecting"
              : streamConnected
                ? "Following live"
                : "Connecting"
            : "Snapshot"}
        </span>
      </div>
      <div className="divide-y divide-border">
        {events.map((event) => (
          <div
            key={event.id}
            className="grid min-w-0 gap-1 px-4 py-3 text-xs transition-colors duration-150 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{humanizeTopic(event.topic)}</p>
              <code className="mt-0.5 block text-[10px] text-muted-foreground">{event.topic}</code>
              <p className="mt-0.5 truncate text-muted-foreground">
                {event.resource_id ?? "Organization event"}
              </p>
            </div>
            <time
              dateTime={event.created_at}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {new Date(event.created_at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
                timeZoneName: "short",
              })}
            </time>
          </div>
        ))}
        {events.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Activity will appear when capture, replay, or assertion work begins.
          </p>
        ) : null}
        {streamUnavailable ? (
          <p
            className="border-t border-tier-pattern/35 bg-tier-pattern/8 px-4 py-3 text-xs text-tier-pattern"
            role="status"
          >
            Live updates paused. Hyrum is retrying the connection; the current snapshot is still
            available.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function parseProgressData(data: string): {
  resource_id: string | null;
  created_at: string;
} | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.created_at !== "string") return null;
      if (record.resource_id !== null && typeof record.resource_id !== "string") return null;
      return {
        resource_id: record.resource_id,
        created_at: record.created_at,
      };
    }
  } catch {
    // A malformed event must not disconnect an otherwise healthy stream.
  }
  return null;
}

function humanizeTopic(topic: string) {
  return topic
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}
