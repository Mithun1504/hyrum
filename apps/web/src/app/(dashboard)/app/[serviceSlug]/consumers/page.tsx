import { Users } from "lucide-react";
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

export default async function ConsumersPage({
  params,
}: Readonly<{ params: Promise<{ serviceSlug: string }> }>) {
  const { serviceSlug } = await params;
  const { data } = await (await currentControlPlaneClient()).consumers(serviceSlug);
  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Blast radius"
        title="Consumers"
        description="Privacy-safe consumer aliases and the accidental behaviors attached to each integration."
      />
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium">No consumers observed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Consumers appear after a redacted capture batch is processed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consumer</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">T1</TableHead>
                  <TableHead className="text-right">T2</TableHead>
                  <TableHead className="text-right">T3</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((consumer) => (
                  <TableRow key={consumer.id}>
                    <TableCell>
                      <div className="font-medium">{consumer.displayAlias}</div>
                      {consumer.lowVolume ? (
                        <Badge variant="outline" className="mt-1">
                          Low-volume boost
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(consumer.lastSeenAt),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {consumer.requestCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{consumer.t1Count}</TableCell>
                    <TableCell className="text-right tabular-nums">{consumer.t2Count}</TableCell>
                    <TableCell className="text-right tabular-nums">{consumer.t3Count}</TableCell>
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
