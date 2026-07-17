"use client";

import { progressEventTopics } from "@hyrum/api-client";
import { useEffect, useState } from "react";
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

    const source = new EventSource("/api/progress");
    const listeners = progressEventTopics.map((topic) => {
      const listener = (event: MessageEvent<string>) => {
        const id = event.lastEventId || crypto.randomUUID();
        setEvents((current) =>
          [
            ...current.filter((item) => item.id !== id),
            {
              id,
              topic,
              resource_id: null,
              created_at: new Date().toISOString(),
            },
          ].slice(-8),
        );
        setStreamUnavailable(false);
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
  }, [live]);

  return (
    <section className="mt-6 rounded-xl border border-border bg-card">
      <div className="flex items-center border-b border-border px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Progress
        {live ? <span className="ml-auto normal-case tracking-normal">live</span> : null}
      </div>
      <div className="divide-y divide-border">
        {events.map((event) => (
          <div
            key={event.id}
            className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 text-xs"
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
