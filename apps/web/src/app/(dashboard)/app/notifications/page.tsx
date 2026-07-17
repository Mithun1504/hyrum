import { Bell, Check, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { dismissNotificationAction, markNotificationReadAction } from "./actions";

export default async function NotificationsPage() {
  const inbox = await (await currentControlPlaneClient()).notifications();
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Workspace activity"
        title="Notifications"
        description="Gate and assertion events that need your attention. Sensitive receipts never appear here."
      />
      {inbox.data.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Gate decisions and assertion reminders will appear here."
        />
      ) : (
        <div className="space-y-3">
          {inbox.data.map((notification) => (
            <Card key={notification.id} className={notification.readAt ? "opacity-75" : undefined}>
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{notification.title}</h2>
                    <Badge
                      variant={notification.severity === "critical" ? "destructive" : "secondary"}
                    >
                      {notification.severity}
                    </Badge>
                    {!notification.readAt ? <Badge variant="outline">New</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{notification.bodyText}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(notification.createdAt))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {notification.deepLinkPath ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={notification.deepLinkPath}>
                        Review <ExternalLink aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                  {!notification.readAt ? (
                    <form action={markNotificationReadAction.bind(null, notification.id)}>
                      <Button type="submit" size="icon" variant="ghost" aria-label="Mark as read">
                        <Check aria-hidden="true" />
                      </Button>
                    </form>
                  ) : null}
                  <form action={dismissNotificationAction.bind(null, notification.id)}>
                    <Button type="submit" size="icon" variant="ghost" aria-label="Dismiss">
                      <X aria-hidden="true" />
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
