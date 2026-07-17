import { Braces } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { currentControlPlaneClient } from "@/services/control-plane";

export default async function EndpointsPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const { data } = await (await currentControlPlaneClient()).endpoints(serviceSlug);
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Operation coverage"
        title="Endpoints"
        description="Declared operations, affected consumers, and accidental-contract concentration."
      />
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Braces className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No operations indexed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload an OpenAPI document to establish the operation catalog.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead>Operation ID</TableHead>
                  <TableHead className="text-right">Consumers</TableHead>
                  <TableHead className="text-right">T1</TableHead>
                  <TableHead className="text-right">T2</TableHead>
                  <TableHead className="text-right">T3</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{endpoint.method}</Badge>
                        <code className="text-sm">{endpoint.normalizedPath}</code>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {endpoint.operationId ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {endpoint.consumerCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{endpoint.t1Count}</TableCell>
                    <TableCell className="text-right tabular-nums">{endpoint.t2Count}</TableCell>
                    <TableCell className="text-right tabular-nums">{endpoint.t3Count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </section>
  );
}
