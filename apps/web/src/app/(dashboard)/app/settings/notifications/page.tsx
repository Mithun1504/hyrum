import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { currentControlPlaneClient } from "@/services/control-plane";
import { PreferenceList } from "./preference-list";

export const metadata: Metadata = { title: "Notification preferences" };

export default async function NotificationPreferencesPage() {
  const { data } = await (await currentControlPlaneClient()).notificationPreferences();
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Personal settings"
        title="Notification preferences"
        description="Choose how Hyrum surfaces optional gate and assertion events. Slack routing remains organization-controlled."
      />
      <PreferenceList preferences={data} />
    </section>
  );
}
