import { withAuth } from "@workos-inc/authkit-nextjs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const { accessToken } = await withAuth();
  if (!accessToken) return new Response("Unauthorized", { status: 401 });
  const upstream = await fetch(
    `${(process.env.CONTROL_PLANE_URL ?? "http://localhost:4000").replace(/\/$/, "")}/v1/events`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "text/event-stream",
        ...(request.headers.get("last-event-id")
          ? { "last-event-id": request.headers.get("last-event-id") as string }
          : {}),
      },
      cache: "no-store",
      signal: request.signal,
    },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response("Event stream unavailable", { status: upstream.status || 502 });
  }
  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
