"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const REFRESH_EVENTS = [
  "agent.created",
  "ingestion.batch_validated",
  "replay.completed",
  "gate.decided",
  "claim.reviewed",
  "specification.activated",
  "assertion.expiring",
  "assertion.expired",
];

export function LiveStatus() {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const lastRefresh = useRef(0);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("offline");
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh.current < 1_000) return;
      lastRefresh.current = now;
      router.refresh();
    };
    for (const eventType of REFRESH_EVENTS) source.addEventListener(eventType, refresh);
    return () => {
      for (const eventType of REFRESH_EVENTS) source.removeEventListener(eventType, refresh);
      source.close();
    };
  }, [router]);

  return (
    <span
      className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex"
      role="status"
      aria-label={`Live updates ${status}`}
    >
      <span
        className={`size-2 rounded-full ${
          status === "live"
            ? "bg-emerald-500"
            : status === "offline"
              ? "bg-destructive"
              : "animate-pulse bg-muted-foreground"
        }`}
        aria-hidden="true"
      />
      {status === "live" ? "Live" : status === "offline" ? "Reconnecting" : "Connecting"}
    </span>
  );
}
