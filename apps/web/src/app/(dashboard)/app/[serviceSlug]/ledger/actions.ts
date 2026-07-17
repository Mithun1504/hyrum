"use server";

import { revalidatePath } from "next/cache";
import { currentControlPlaneClient } from "@/services/control-plane";

export async function getReceiptAccess(receiptId: string): Promise<string> {
  const client = await currentControlPlaneClient();
  return (await client.receiptAccess(receiptId)).url;
}

export async function reviewLedgerEntryAction(input: {
  serviceSlug: string;
  ledgerEntryId: string;
  decision: "confirmed" | "demoted" | "promoted" | "dismissed";
  toTier?: "t1" | "t2" | "t3";
  reason: string;
  expectedUpdatedAt: string;
}): Promise<void> {
  const client = await currentControlPlaneClient();
  await client.reviewLedgerEntry(input.ledgerEntryId, {
    decision: input.decision,
    reason: input.reason,
    expectedUpdatedAt: input.expectedUpdatedAt,
    ...(input.toTier ? { toTier: input.toTier } : {}),
  });
  revalidatePath(`/app/${input.serviceSlug}/ledger`);
}

export async function requestBehaviorLabelAction(serviceSlug: string, behaviorId: string) {
  const result = await (await currentControlPlaneClient()).requestBehaviorLabelProposal(behaviorId);
  revalidatePath(`/app/${serviceSlug}/ledger`);
  return result;
}

export async function reviewBehaviorLabelAction(
  serviceSlug: string,
  labelId: string,
  decision: "accept" | "reject",
) {
  await (await currentControlPlaneClient()).reviewBehaviorLabel(labelId, decision);
  revalidatePath(`/app/${serviceSlug}/ledger`);
}

export async function requestTierProposalAction(serviceSlug: string, claimId: string) {
  const result = await (await currentControlPlaneClient()).requestTierProposal(claimId);
  revalidatePath(`/app/${serviceSlug}/ledger`);
  return result;
}
