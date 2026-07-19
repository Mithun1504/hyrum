import { controlPlaneBaseUrl } from "@/services/control-plane";
import { dashboardAuth } from "@/services/dashboard-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { accessToken } = await dashboardAuth();
  const requestedId = Number(new URL(request.url).searchParams.get("last_event_id") ?? "0");
  const lastEventId = Number.isSafeInteger(requestedId) && requestedId >= 0 ? requestedId : 0;
  const upstream = await fetch(
    `${controlPlaneBaseUrl}/v1/progress/stream?last_event_id=${lastEventId}`,
    {
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: request.signal,
    },
  );

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { detail: "The control plane progress stream is unavailable." },
      { status: upstream.status || 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
    },
  });
}
