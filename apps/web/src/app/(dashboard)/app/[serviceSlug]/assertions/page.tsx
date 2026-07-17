import { ControlPlaneError } from "@hyrum/api-client";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { AssertionManager } from "./assertion-manager";

export default async function AssertionsPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  const pageDataPromise = Promise.all([
    client.service(serviceSlug),
    client.assertions(serviceSlug),
    client.ledger(serviceSlug, { limit: 100 }),
    client.members(),
    client.session(),
  ]);
  let pageData: Awaited<typeof pageDataPromise>;
  try {
    pageData = await pageDataPromise;
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  const [service, assertions, ledger, directory, session] = pageData;
  const draftEntries = await Promise.all(
    assertions.data.flatMap((assertion) => {
      const plan = assertion.breakingChangePlan;
      const assertionDraft = (async () =>
        [
          `${assertion.id}:spec_patch`,
          (await client.assertionSpecPatch(assertion.id)).data,
        ] as const)();
      if (!plan) return [assertionDraft];
      return [
        assertionDraft,
        ...(["customer_notice"] as const).map(
          async (draftType) =>
            [
              `${plan.id}:${draftType}`,
              (await client.productDraft(plan.id, draftType)).data,
            ] as const,
        ),
      ];
    }),
  );
  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + 90);
  const timezoneOffset = defaultExpiry.getTimezoneOffset() * 60_000;
  const defaultExpiresAt = new Date(defaultExpiry.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 16);
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Compatibility commitments"
        title={`${service.name} assertions`}
        description="Pin important accidental contracts into every replay, assign an owner, and force an explicit expiry or deliberate resolution."
      />
      <AssertionManager
        serviceSlug={serviceSlug}
        assertions={assertions.data}
        ledger={ledger.data}
        members={directory.members}
        currentMembershipId={session.membershipId}
        canManage={session.permissions.includes("assertion:manage")}
        recentlyAuthenticated={session.recentlyAuthenticated}
        defaultExpiresAt={defaultExpiresAt}
        drafts={Object.fromEntries(draftEntries)}
      />
    </section>
  );
}
