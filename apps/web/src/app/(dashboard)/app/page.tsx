import { DatabaseZap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export default function WorkspacePage() {
  return (
    <section className="space-y-section">
      <div>
        <p className="text-sm font-medium text-primary">Workspace</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Accidental contract ledger</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The authenticated shell is ready for feature development.
        </p>
      </div>
      <EmptyState
        icon={DatabaseZap}
        title="No ledger data yet"
        description="Capture, dependency inference, and replay are business features and are intentionally absent from this scaffold."
      />
    </section>
  );
}
