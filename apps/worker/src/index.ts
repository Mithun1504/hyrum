import { hostname } from "node:os";
import { createDatabaseClient } from "@hyrum/db";
import { parseRuntimeEnv } from "@hyrum/env";
import { createLogger } from "@hyrum/logger";
import { ObjectStorage } from "@hyrum/storage";
import {
  expireAssertionHandler,
  remindAssertionExpiryHandler,
} from "./handlers/assertion-lifecycle";
import { createBuildReplayCorpusHandler } from "./handlers/build-replay-corpus";
import {
  createPrepareOrganizationDeletionHandler,
  createPurgeDeletingOrganizationsHandler,
} from "./handlers/delete-organization";
import { createDeliverSlackNotificationHandler } from "./handlers/deliver-slack-notification";
import { createExportOrganizationDataHandler } from "./handlers/export-organization-data";
import { createGenerateBehaviorLabelHandler } from "./handlers/generate-behavior-label";
import { createGenerateProductDraftHandler } from "./handlers/generate-product-draft";
import { createGenerateReplayImpactHandler } from "./handlers/generate-replay-impact";
import { createGenerateTierProposalHandler } from "./handlers/generate-tier-proposal";
import {
  createEnforceObjectRetentionHandler,
  refreshLedgerFreshnessHandler,
} from "./handlers/maintenance";
import { createProcessIngestionBatchHandler } from "./handlers/process-ingestion-batch";
import { createPublishGitHubCheckHandler } from "./handlers/publish-github-check";
import { routeNotificationHandler } from "./handlers/route-notification";
import { runWorker } from "./runner";

const env = parseRuntimeEnv();
const logger = createLogger("worker", env.LOG_LEVEL);
const database = createDatabaseClient(env.DATABASE_URL, env.DATABASE_POOL_MAX);
const controller = new AbortController();
const objectStorage = new ObjectStorage({
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
    : {}),
});
const handlers = new Map([
  ["process_ingestion_batch", createProcessIngestionBatchHandler(objectStorage)],
  ["remind_assertion_expiry", remindAssertionExpiryHandler],
  ["expire_assertion", expireAssertionHandler],
  ["build_replay_corpus", createBuildReplayCorpusHandler(objectStorage)],
  [
    "generate_replay_impact_explanation",
    createGenerateReplayImpactHandler({ apiKey: env.OPENAI_API_KEY }),
  ],
  [
    "generate_product_draft",
    createGenerateProductDraftHandler({ apiKey: env.OPENAI_API_KEY, storage: objectStorage }),
  ],
  ["generate_behavior_label", createGenerateBehaviorLabelHandler({ apiKey: env.OPENAI_API_KEY })],
  ["generate_tier_proposal", createGenerateTierProposalHandler({ apiKey: env.OPENAI_API_KEY })],
  [
    "publish_github_check",
    createPublishGitHubCheckHandler({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      webUrl: env.WEB_URL,
    }),
  ],
  ["route_notification", routeNotificationHandler],
  ["refresh_ledger_freshness", refreshLedgerFreshnessHandler],
  ["enforce_object_retention", createEnforceObjectRetentionHandler(objectStorage)],
  ["export_organization_data", createExportOrganizationDataHandler(objectStorage)],
  ["prepare_organization_deletion", createPrepareOrganizationDeletionHandler(objectStorage)],
  ["purge_deleting_organizations", createPurgeDeletingOrganizationsHandler(objectStorage)],
  [
    "deliver_slack_notification",
    createDeliverSlackNotificationHandler({
      encryptionKey: env.INTEGRATION_TOKEN_ENCRYPTION_KEY,
      webUrl: env.WEB_URL,
    }),
  ],
]);

const stop = () => controller.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

logger.info({ workerId: hostname() }, "worker started");
await runWorker({ db: database.db, logger, workerId: hostname(), handlers }, controller.signal);
await database.close();
logger.info("worker stopped");
