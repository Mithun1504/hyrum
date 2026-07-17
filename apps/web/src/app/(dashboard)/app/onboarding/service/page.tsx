import { roleHasPermission } from "@hyrum/contracts";
import { LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getWorkspace } from "@/services/workspace";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Add API service" };

export default async function ServiceOnboardingPage() {
  const { session, services } = await getWorkspace();
  const canManageServices = roleHasPermission(session.role, "service:manage");

  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow={services.length === 0 ? "Workspace setup" : "Service settings"}
        title={services.length === 0 ? "Add your first monitored API" : "Add another API service"}
        description="Create the stable service and environment boundary Hyrum will use for specifications, capture, replay, and change gates."
      />
      {canManageServices ? (
        <ServiceForm />
      ) : (
        <EmptyState
          icon={LockKeyhole}
          title="An owner or admin must add the first service"
          description="Your current role can inspect configured services, but it cannot create or change workspace service boundaries."
        />
      )}
    </section>
  );
}
