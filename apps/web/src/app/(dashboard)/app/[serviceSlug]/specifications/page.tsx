import { ControlPlaneError } from "@hyrum/api-client";
import { FileJson2 } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentControlPlaneClient } from "@/services/control-plane";
import { SpecificationForm } from "./specification-form";

interface SpecificationPageProps {
  params: Promise<{ serviceSlug: string }>;
}

export default async function SpecificationPage({ params }: Readonly<SpecificationPageProps>) {
  const { serviceSlug } = await params;
  const client = await currentControlPlaneClient();
  try {
    await client.service(serviceSlug);
  } catch (error) {
    if (error instanceof ControlPlaneError && error.problem.status === 404) notFound();
    throw error;
  }
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Declared contract"
        title="Upload an OpenAPI specification"
        description="Hyrum validates and canonicalizes the document, then maps stable operations without fetching remote references."
      />
      <Card className="max-w-4xl shadow-panel">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileJson2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Specification source</CardTitle>
              <CardDescription>
                The active version is immutable and fully tenant-scoped.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SpecificationForm serviceSlug={serviceSlug} />
        </CardContent>
      </Card>
    </section>
  );
}
