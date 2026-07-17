import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncWorkosMembership } from "./identity";
import { createDatabaseClient, type DatabaseClient } from "./index";
import { claimJobs, completeJob, dispatchScheduledTasks, failJob, renewJobLease } from "./jobs";
import { jobs, scheduledTasks } from "./schema";
import { withOrganizationContext } from "./tenancy";

const databaseUrl = process.env.DATABASE_TEST_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("job lease integration", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createDatabaseClient(databaseUrl as string, 4);
  });

  afterAll(async () => {
    await client.close();
  });

  it("reclaims an expired running job and fences the stale worker", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_job_test_${suffix}`,
      organizationName: "Job Test",
      organizationSlug: `job-test-${suffix}`,
      workosUserId: `user_job_test_${suffix}`,
      userEmail: `worker-${suffix}@example.test`,
      userDisplayName: "Worker Test",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_job_test_${suffix}`,
      role: "admin",
      status: "active",
    });

    const [inserted] = await withOrganizationContext(client.db, identity.organizationId, (tx) =>
      tx
        .insert(jobs)
        .values({
          organizationId: identity.organizationId,
          type: "lease.integration",
          payload: { fixture: true },
          idempotencyKey: `lease-${suffix}`,
          priority: 32_767,
          maxAttempts: 3,
        })
        .returning({ id: jobs.id }),
    );
    expect(inserted).toBeDefined();

    const [first] = await claimJobs(client.db, "worker-a", 1, 5_000);
    if (!first) throw new Error("expected the fixture job to be claimed");
    expect(first).toMatchObject({
      id: inserted?.id,
      organizationId: identity.organizationId,
      attempts: 1,
    });

    await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      await tx
        .update(jobs)
        .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
        .where(eq(jobs.id, first?.id as string));
    });

    const [reclaimed] = await claimJobs(client.db, "worker-b", 1, 5_000);
    if (!reclaimed) throw new Error("expected the expired fixture job to be reclaimed");
    expect(reclaimed).toMatchObject({ id: first?.id, attempts: 2 });
    expect(reclaimed?.leaseOwner).not.toBe(first?.leaseOwner);

    expect(await renewJobLease(client.db, first, 5_000)).toBe(false);
    expect(await completeJob(client.db, first)).toBe(false);
    expect(await failJob(client.db, first, new Error("stale"))).toBe(false);
    expect(await completeJob(client.db, reclaimed)).toBe(true);

    const status = await withOrganizationContext(client.db, identity.organizationId, async (tx) => {
      const [record] = await tx
        .select({ status: jobs.status, completedAt: jobs.completedAt })
        .from(jobs)
        .where(eq(jobs.id, inserted?.id as string));
      return record;
    });
    expect(status?.status).toBe("succeeded");
    expect(status?.completedAt).toBeInstanceOf(Date);
  });

  it("seeds and atomically dispatches tenant maintenance", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const identity = await syncWorkosMembership(client.sql, {
      workosOrganizationId: `org_schedule_test_${suffix}`,
      organizationName: "Schedule Test",
      organizationSlug: `schedule-test-${suffix}`,
      workosUserId: `user_schedule_test_${suffix}`,
      userEmail: `schedule-${suffix}@example.test`,
      userDisplayName: "Schedule Test",
      userAvatarUrl: null,
      lastAuthenticatedAt: new Date(),
      workosMembershipId: `membership_schedule_test_${suffix}`,
      role: "admin",
      status: "active",
    });
    const seeded = await withOrganizationContext(client.db, identity.organizationId, (tx) =>
      tx
        .select({ taskType: scheduledTasks.taskType })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.organizationId, identity.organizationId)),
    );
    expect(seeded.map(({ taskType }) => taskType).sort()).toEqual([
      "enforce_object_retention",
      "refresh_ledger_freshness",
    ]);
    expect(await dispatchScheduledTasks(client.db)).toBeGreaterThanOrEqual(2);
    const enqueued = await withOrganizationContext(client.db, identity.organizationId, (tx) =>
      tx
        .select({ type: jobs.type })
        .from(jobs)
        .where(eq(jobs.organizationId, identity.organizationId)),
    );
    expect(enqueued.map(({ type }) => type).sort()).toEqual([
      "enforce_object_retention",
      "refresh_ledger_freshness",
    ]);
    expect(await dispatchScheduledTasks(client.db)).toBe(0);
  });
});
