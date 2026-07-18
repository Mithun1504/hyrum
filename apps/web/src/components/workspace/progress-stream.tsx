"use client";

import { progressEventTopics } from "@hyrum/api-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
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
    initialEvents.map((event) => ({
      id: String(event.id),
      topic: event.topic,
      resource_id: event.resource_id,
      created_at: event.created_at,
    })),
  );
  const [streamUnavailable, setStreamUnavailable] = useState(false);

  useEffect(() => {
    if (!live) return;

    const lastEventId = initialEvents.at(-1)?.id ?? 0;
    const source = new EventSource(`/api/progress?last_event_id=${lastEventId}`);
    const listeners = progressEventTopics.map((topic) => {
      const listener = (event: MessageEvent<string>) => {
        const id = event.lastEventId || crypto.randomUUID();
        const parsed = parseProgressData(event.data);
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
        startTransition(() => router.refresh());
      };
      source.addEventListener(topic, listener as EventListener);
      return { topic, listener };
    });
    source.onerror = () => setStreamUnavailable(true);

    return () => {
      for (const { topic, listener } of listeners) {
        source.removeEventListener(topic, listener as EventListener);
      }
      source.close();
    };
  }, [initialEvents, live, router]);

  return (
    <section className="glass-panel mt-5 overflow-hidden rounded-2xl">
      <div className="flex items-center border-b px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Live evidence stream
        {live ? <span className="ml-auto normal-case tracking-normal">live</span> : null}
      </div>
      <div className="divide-y divide-border">
        {events.map((event) => (
          <div
            key={event.id}
            className="motion-lift flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 text-xs hover:bg-secondary/45"
          >
            <Badge variant="outline" className="text-tier-proof">
              {event.topic}
            </Badge>
            <span className="min-w-0 truncate text-muted-foreground">
              {event.resource_id ?? "tenant event"}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {new Date(event.created_at).toLocaleTimeString("en-US")}
            </span>
          </div>
        ))}
        {events.length === 0 ? (
          <p className="px-4 py-5 text-xs text-muted-foreground">
            New capture, ledger, replay, and assertion events will appear here.
          </p>
        ) : null}
        {streamUnavailable ? (
          <p className="px-4 py-3 text-[11px] text-destructive">
            Live progress is disconnected. The stream will retry automatically.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function parseProgressData(data: string): {
  resource_id: string | null;
  created_at: string;
} {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return {
        resource_id: typeof record.resource_id === "string" ? record.resource_id : null,
        created_at:
          typeof record.created_at === "string" ? record.created_at : new Date().toISOString(),
      };
    }
  } catch {
    // A malformed event must not disconnect an otherwise healthy stream.
  }
  return { resource_id: null, created_at: new Date().toISOString() };
}
