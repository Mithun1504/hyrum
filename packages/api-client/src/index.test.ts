import { describe, expect, it, vi } from "vitest";
import { createControlPlaneClient } from "./index";

const service = {
  id: "019f6274-8db5-7313-b96e-9d721f04f3d7",
  name: "Payments API",
  slug: "payments-api",
  description: null,
  status: "active",
  ownerMembershipId: "019f6274-b573-71a0-b6ad-218a45f825dc",
  firstCaptureAt: null,
  firstUsefulLedgerAt: null,
  createdAt: "2026-07-15T08:00:00.000Z",
  defaultEnvironment: {
    id: "019f6274-d611-7351-bd13-7d8324930df3",
    name: "Production",
    slug: "production",
    kind: "production",
    baseUrlOrigin: "https://api.example.test",
    captureEnabled: true,
    isDefault: true,
  },
};

describe("control-plane service client", () => {
  it("loads a service detail using an encoded identifier and bearer token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(service), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createControlPlaneClient({
      baseUrl: "https://control.example.test/",
      getAccessToken: async () => "access-token",
      fetch: fetcher,
    });

    await expect(client.service("payments-api")).resolves.toEqual(service);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://control.example.test/v1/services/payments-api");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("loads identity organization choices without an organization-scoped path", async () => {
    const body = {
      data: [
        {
          organizationId: "019f6274-8db5-7313-b96e-9d721f04f3d7",
          workosOrganizationId: "org_01JTEST",
          membershipId: "019f6274-b573-71a0-b6ad-218a45f825dc",
          slug: "acme-org01jtest",
          name: "Acme",
          status: "active",
          role: "owner",
        },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const client = createControlPlaneClient({
      baseUrl: "https://control.example.test",
      getAccessToken: async () => "identity-token",
      fetch: fetcher,
    });

    await expect(client.identityOrganizations()).resolves.toEqual(body);
    expect(fetcher).toHaveBeenCalledWith(
      "https://control.example.test/v1/me/organizations",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
