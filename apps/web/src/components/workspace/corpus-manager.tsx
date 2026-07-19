"use client";

import type { ReplayCorpus } from "@hyrum/contracts";
import { Archive, Database, Plus, ShieldCheck, Upload } from "lucide-react";
import { type ChangeEvent, useActionState, useState } from "react";
import {
  addReplayCorpusItemAction,
  createReplayCorpusAction,
  type MutationState,
  prepareCorpusUploadAction,
  updateReplayCorpusStatusAction,
} from "@/app/(dashboard)/app/actions";
import { Button } from "@/components/ui/button";

const initialState: MutationState = { status: "idle", message: "" };

export function CorpusManager({
  corpora,
  canManage,
}: {
  corpora: ReplayCorpus[];
  canManage: boolean;
}) {
  const draft = corpora.find((corpus) => corpus.curation_status === "draft");
  const [createState, createAction, creating] = useActionState(
    createReplayCorpusAction,
    initialState,
  );
  const [itemState, itemAction, adding] = useActionState(addReplayCorpusItemAction, initialState);
  const [statusState, statusAction, updating] = useActionState(
    updateReplayCorpusStatusAction,
    initialState,
  );

  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 md:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4" aria-hidden="true" /> Replay corpus curation
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Curate redacted request cases, a fixture database, and side-effect stubs before an
            isolated runner may use a corpus. Digests and tenant-scoped object keys are persisted by
            the control plane.
          </p>
        </div>
        <span className="rounded-[4px] border border-border px-2 py-1 text-xs text-muted-foreground">
          {corpora.length} version{corpora.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] md:p-6">
        <div className="grid content-start gap-3">
          {corpora.length ? (
            corpora.map((corpus) => (
              <CorpusSummary key={corpus.id} corpus={corpus} canManage={canManage} />
            ))
          ) : (
            <p className="rounded-[4px] border border-dashed border-border p-4 text-sm text-muted-foreground">
              No replay corpus has been curated for this organization.
            </p>
          )}
        </div>

        <div className="grid content-start gap-4">
          {draft ? (
            <>
              <form
                action={itemAction}
                className="grid gap-3 rounded-[4px] border border-border p-4"
              >
                <input type="hidden" name="corpus_id" value={draft.id} />
                <FormHeading title={`Add case to ${draft.version}`} />
                <Field name="case_id" label="Case ID" placeholder="checkout-idempotency" />
                <Field name="coverage_class" label="Coverage class" placeholder="response-shape" />
                <ArtifactUploadField
                  keyName="object_key"
                  digestName="digest"
                  label="Redacted request case"
                  required
                />
                <Field name="priority" label="Replay priority" placeholder="100" type="number" />
                <Button type="submit" disabled={!canManage || adding} className="w-fit gap-2">
                  <Plus aria-hidden="true" /> {adding ? "Adding case" : "Add enabled case"}
                </Button>
                <ActionMessage state={itemState} />
              </form>
              <form
                action={statusAction}
                className="flex flex-wrap items-center gap-3 rounded-[4px] border border-border p-4"
              >
                <input type="hidden" name="corpus_id" value={draft.id} />
                <input type="hidden" name="curation_status" value="ready" />
                <Button type="submit" disabled={!canManage || updating} className="gap-2">
                  <ShieldCheck aria-hidden="true" /> {updating ? "Validating" : "Mark ready"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Requires fixture metadata and at least one enabled case.
                </p>
                <ActionMessage state={statusState} />
              </form>
            </>
          ) : (
            <form
              action={createAction}
              className="grid gap-3 rounded-[4px] border border-border p-4"
            >
              <fieldset disabled={!canManage} className="contents">
                <FormHeading title="Create a draft corpus" />
                <Field name="version" label="Version" placeholder="2026.07.18" />
                <ArtifactUploadField
                  keyName="object_key"
                  digestName="digest"
                  label="Redacted corpus archive"
                  required
                />
                <ArtifactUploadField
                  keyName="fixture_object_key"
                  digestName="fixture_digest"
                  label="Disposable fixture database"
                  required
                />
                <ArtifactUploadField
                  keyName="stubs_object_key"
                  label="Side-effect stub configuration (optional)"
                />
                <Button type="submit" disabled={!canManage || creating} className="w-fit gap-2">
                  <Plus aria-hidden="true" />
                  {creating ? "Creating draft" : "Create draft corpus"}
                </Button>
                <ActionMessage state={createState} />
              </fieldset>
            </form>
          )}
          {!canManage ? (
            <p className="text-xs text-muted-foreground">
              Owner, admin, or engineer access is required to curate corpora.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CorpusSummary({ corpus, canManage }: { corpus: ReplayCorpus; canManage: boolean }) {
  const [state, action, pending] = useActionState(updateReplayCorpusStatusAction, initialState);
  return (
    <article className="grid gap-3 rounded-[4px] border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Corpus {corpus.version}</h3>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{corpus.digest}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-2 py-1 text-xs capitalize">
          {corpus.curation_status === "archived" ? <Archive className="size-3" /> : null}
          {corpus.curation_status}
        </span>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <CorpusFact
          label="enabled cases"
          value={String(corpus.items.filter((item) => item.enabled).length)}
        />
        <CorpusFact label="fixture" value={corpus.fixture_digest ? "verified digest" : "missing"} />
        <CorpusFact
          label="side-effect stubs"
          value={corpus.stubs_object_key ? "configured" : "none"}
        />
      </dl>
      {corpus.curation_status === "ready" ? (
        <form
          action={action}
          className="flex flex-wrap items-center gap-3 border-t border-border pt-3"
        >
          <input type="hidden" name="corpus_id" value={corpus.id} />
          <input type="hidden" name="curation_status" value="archived" />
          <Button type="submit" variant="outline" size="sm" disabled={!canManage || pending}>
            <Archive aria-hidden="true" /> {pending ? "Archiving" : "Archive version"}
          </Button>
          <ActionMessage state={state} />
        </form>
      ) : null}
    </article>
  );
}

function CorpusFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function FormHeading({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold">{title}</h3>;
}

function Field({
  name,
  label,
  placeholder,
  mono = false,
  type = "text",
}: {
  name: string;
  label: string;
  placeholder: string;
  mono?: boolean;
  type?: "text" | "number";
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium">
      {label}
      <input
        required={name !== "stubs_object_key"}
        name={name}
        type={type}
        min={type === "number" ? 1 : undefined}
        placeholder={placeholder}
        className={`min-h-10 rounded-[4px] border border-input bg-background px-3 text-sm placeholder:text-muted-foreground ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

function ArtifactUploadField({
  keyName,
  digestName,
  label,
  required = false,
}: {
  keyName: string;
  digestName?: string;
  label: string;
  required?: boolean;
}) {
  const [objectKey, setObjectKey] = useState("");
  const [digest, setDigest] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function uploadArtifact(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setObjectKey("");
    setDigest("");
    if (!file) {
      setStatus("idle");
      setMessage("");
      return;
    }
    setStatus("uploading");
    setMessage("Hashing and uploading artifact…");
    try {
      const bytes = await file.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const hex = [...new Uint8Array(hash)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const prepared = await prepareCorpusUploadAction({
        digest: `sha256:${hex}`,
        sizeBytes: file.size,
        contentType: file.type || "application/octet-stream",
      });
      if (prepared.status === "error") throw new Error(prepared.message);
      const response = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: prepared.headers,
        body: file,
      });
      if (!response.ok) throw new Error(`Object storage returned ${response.status}`);
      setObjectKey(prepared.objectKey);
      setDigest(prepared.digest);
      setStatus("success");
      setMessage(`${file.name} uploaded and integrity-addressed.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Artifact upload failed.");
    }
  }

  return (
    <label className="grid gap-1.5 text-xs font-medium">
      {label}
      <span className="relative flex min-h-11 items-center rounded-[4px] border border-dashed border-input bg-background px-3">
        <Upload className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-sm text-muted-foreground">
          {status === "idle" ? "Choose a file" : message}
        </span>
        <input
          type="file"
          required={required}
          disabled={status === "uploading"}
          onChange={uploadArtifact}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
      <input type="hidden" name={keyName} value={objectKey} required={required} />
      {digestName ? (
        <input type="hidden" name={digestName} value={digest} required={required} />
      ) : null}
      {status === "error" ? <span className="text-destructive">{message}</span> : null}
      {status === "success" ? (
        <span className="break-all font-mono text-[10px] text-status-success">{objectKey}</span>
      ) : null}
    </label>
  );
}

function ActionMessage({ state }: { state: MutationState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={
        state.status === "error" ? "text-xs text-destructive" : "text-xs text-status-success"
      }
      role="status"
    >
      {state.message}
    </p>
  );
}
