import { withAuth } from "@workos-inc/authkit-nextjs";
import { controlPlaneBaseUrl, isDemoDataEnabled } from "@/services/control-plane";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isDemoDataEnabled()) return new Response(null, { status: 204 });

  const { accessToken } = await withAuth({ ensureSignedIn: true });
  const upstream = await fetch(`${controlPlaneBaseUrl}/v1/progress/stream?last_event_id=0`, {
    headers: {
      accept: "text/event-stream",
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: request.signal,
  });

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
