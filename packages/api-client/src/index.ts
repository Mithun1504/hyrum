import {
  advisoryBatchResponseSchema,
  advisoryRunSchema,
  agentListSchema,
  agentRegistrationDefaultsSchema,
  apiServiceSchema,
  assertionListSchema,
  assertionSchema,
  behaviorLabelProposalResponseSchema,
  breakingChangePlanSchema,
  type CreateAgentRequest,
  type CreateAssertionRequest,
  type CreateDataSubjectRequest,
  type CreateReplayRunRequest,
  type CreateServiceRequest,
  type CreateSupportGrant,
  configureSlackInstallationSchema,
  consumerInsightListSchema,
  corpusBuildResponseSchema,
  createAgentResponseSchema,
  createReplayRunResponseSchema,
  createRepositoryConnectionSchema,
  dataSubjectDownloadSchema,
  dataSubjectRequestListSchema,
  type ExtendAssertionRequest,
  endpointInsightListSchema,
  gateExceptionListSchema,
  gateExceptionSchema,
  gatePolicySchema,
  generatedDraftResponseSchema,
  globalSearchResponseSchema,
  healthResponseSchema,
  type InviteMemberRequest,
  identityOrganizationListSchema,
  type LedgerReviewRequest,
  ledgerListSchema,
  ledgerReviewResponseSchema,
  memberDirectorySchema,
  type NotificationEventType,
  notificationInboxSchema,
  notificationPreferenceListSchema,
  notificationPreferenceSchema,
  notificationSchema,
  onboardingProgressSchema,
  organizationInvitationSchema,
  organizationMemberSchema,
  organizationSummarySchema,
  type ProblemDetails,
  platformHealthSchema,
  problemDetailsSchema,
  type ResolveAssertionRequest,
  receiptAccessSchema,
  replayCorpusWorkspaceSchema,
  replayImpactExplanationResponseSchema,
  replayRunDetailSchema,
  replayRunListSchema,
  repositoryConnectionListSchema,
  repositoryConnectionSchema,
  requestGateExceptionSchema,
  type ScheduleBreakingChangeRequest,
  serviceHealthReportSchema,
  serviceInsightsSchema,
  serviceListSchema,
  sessionResponseSchema,
  slackInstallationResponseSchema,
  slackInstallationSchema,
  slackOAuthCallbackSchema,
  slackOAuthUrlRequestSchema,
  slackOAuthUrlSchema,
  specificationUploadResponseSchema,
  supportGrantSchema,
  type TransferOwnershipRequest,
  tierProposalResponseSchema,
  type UpdateMemberRoleRequest,
  type UpdateMemberStatusRequest,
  type UpdateNotificationPreference,
  type UpdateOrganizationRequest,
  type UpdateRetentionRequest,
  type UploadSpecificationRequest,
  updateGatePolicySchema,
} from "@hyrum/contracts";

export class ControlPlaneError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ControlPlaneError";
  }
}

export interface ControlPlaneClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export function createControlPlaneClient(options: ControlPlaneClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request(path: string, init: RequestInit = {}) {
    const accessToken = await options.getAccessToken?.();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

    const response = await fetcher(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({
        title: "Control plane request failed",
        status: response.status,
      }));
      throw new ControlPlaneError(problemDetailsSchema.parse(body));
    }
    return response;
  }

  return {
    async health() {
      const response = await request("/health");
      return healthResponseSchema.parse(await response.json());
    },
    async session() {
      const response = await request("/v1/session");
      return sessionResponseSchema.parse(await response.json());
    },
    async identityOrganizations() {
      const response = await request("/v1/me/organizations");
      return identityOrganizationListSchema.parse(await response.json());
    },
    async members() {
      const response = await request("/v1/members");
      return memberDirectorySchema.parse(await response.json());
    },
    async notifications() {
      const response = await request("/v1/notifications");
      return notificationInboxSchema.parse(await response.json());
    },
    async search(query: string, limit = 8) {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      const response = await request(`/v1/search?${params}`);
      return globalSearchResponseSchema.parse(await response.json());
    },
    async notificationPreferences() {
      const response = await request("/v1/notification-preferences");
      return notificationPreferenceListSchema.parse(await response.json());
    },
    async updateNotificationPreference(
      eventType: NotificationEventType,
      input: UpdateNotificationPreference,
    ) {
      const response = await request(
        `/v1/notification-preferences/${encodeURIComponent(eventType)}`,
        { method: "PUT", body: JSON.stringify(input) },
      );
      return notificationPreferenceSchema.parse(await response.json());
    },
    async markNotificationRead(notificationId: string) {
      const response = await request(
        `/v1/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: "POST" },
      );
      return notificationSchema.parse(await response.json());
    },
    async dismissNotification(notificationId: string) {
      await request(`/v1/notifications/${encodeURIComponent(notificationId)}`, {
        method: "DELETE",
      });
    },
    async inviteMember(input: InviteMemberRequest) {
      const response = await request("/v1/invitations", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return organizationInvitationSchema.parse(await response.json());
    },
    async resendInvitation(invitationId: string) {
      const response = await request(`/v1/invitations/${encodeURIComponent(invitationId)}/resend`, {
        method: "POST",
      });
      return organizationInvitationSchema.parse(await response.json());
    },
    async revokeInvitation(invitationId: string) {
      const response = await request(`/v1/invitations/${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
      return organizationInvitationSchema.parse(await response.json());
    },
    async updateMemberRole(membershipId: string, input: UpdateMemberRoleRequest) {
      const response = await request(`/v1/members/${encodeURIComponent(membershipId)}/role`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      return organizationMemberSchema.parse(await response.json());
    },
    async updateMemberStatus(membershipId: string, input: UpdateMemberStatusRequest) {
      const response = await request(`/v1/members/${encodeURIComponent(membershipId)}/status`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      return organizationMemberSchema.parse(await response.json());
    },
    async transferOwnership(input: TransferOwnershipRequest) {
      await request("/v1/organization/transfer-ownership", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async organization() {
      const response = await request("/v1/organization");
      return organizationSummarySchema.parse(await response.json());
    },
    async slackInstallation() {
      const response = await request("/v1/integrations/slack");
      return slackInstallationResponseSchema.parse(await response.json());
    },
    async configureSlack(input: unknown) {
      const body = configureSlackInstallationSchema.parse(input);
      const response = await request("/v1/integrations/slack/configure", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return slackInstallationSchema.parse(await response.json());
    },
    async slackOAuthUrl(input: unknown) {
      const body = slackOAuthUrlRequestSchema.parse(input);
      const response = await request("/v1/integrations/slack/oauth-url", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return slackOAuthUrlSchema.parse(await response.json());
    },
    async completeSlackOAuth(input: unknown) {
      const body = slackOAuthCallbackSchema.parse(input);
      const response = await request("/v1/integrations/slack/oauth-callback", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return slackInstallationSchema.parse(await response.json());
    },
    async repositoryConnections(identifier: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/repository-connections`,
      );
      return repositoryConnectionListSchema.parse(await response.json());
    },
    async createRepositoryConnection(identifier: string, input: unknown) {
      const body = createRepositoryConnectionSchema.parse(input);
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/repository-connections`,
        { method: "POST", body: JSON.stringify(body) },
      );
      return repositoryConnectionSchema.parse(await response.json());
    },
    async gateExceptions(identifier: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/gate-exceptions`,
      );
      return gateExceptionListSchema.parse(await response.json());
    },
    async requestGateException(gateImpactId: string, input: unknown) {
      const body = requestGateExceptionSchema.parse(input);
      const response = await request(
        `/v1/gate-impacts/${encodeURIComponent(gateImpactId)}/exception`,
        { method: "POST", body: JSON.stringify(body) },
      );
      return gateExceptionSchema.parse(await response.json());
    },
    async approveGateException(gateExceptionId: string) {
      const response = await request(
        `/v1/gate-exceptions/${encodeURIComponent(gateExceptionId)}/approve`,
        { method: "POST" },
      );
      return gateExceptionSchema.parse(await response.json());
    },
    async gatePolicy(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/gate-policy`);
      return gatePolicySchema.parse(await response.json());
    },
    async updateGatePolicy(identifier: string, input: unknown) {
      const body = updateGatePolicySchema.parse(input);
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/gate-policy`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return gatePolicySchema.parse(await response.json());
    },
    async updateOrganization(input: UpdateOrganizationRequest) {
      const response = await request("/v1/organization", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      return organizationSummarySchema.parse(await response.json());
    },
    async updateRetention(input: UpdateRetentionRequest) {
      const response = await request("/v1/organization/retention", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      return organizationSummarySchema.parse(await response.json());
    },
    async services(options: { cursor?: string; limit?: number } = {}) {
      const query = new URLSearchParams();
      if (options.cursor) query.set("cursor", options.cursor);
      if (options.limit) query.set("limit", String(options.limit));
      const suffix = query.size > 0 ? `?${query}` : "";
      const response = await request(`/v1/services${suffix}`);
      return serviceListSchema.parse(await response.json());
    },
    async service(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}`);
      return apiServiceSchema.parse(await response.json());
    },
    async serviceHealthReport(identifier: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/reports/health`,
      );
      return serviceHealthReportSchema.parse(await response.json());
    },
    async insights(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/insights`);
      return serviceInsightsSchema.parse(await response.json());
    },
    async consumers(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/consumers`);
      return consumerInsightListSchema.parse(await response.json());
    },
    async endpoints(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/endpoints`);
      return endpointInsightListSchema.parse(await response.json());
    },
    async onboarding(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/onboarding`);
      return onboardingProgressSchema.parse(await response.json());
    },
    async createService(input: CreateServiceRequest) {
      const response = await request("/v1/services", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return apiServiceSchema.parse(await response.json());
    },
    async uploadSpecification(identifier: string, input: UploadSpecificationRequest) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/specifications`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return specificationUploadResponseSchema.parse(await response.json());
    },
    async agents(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/agents`);
      return agentListSchema.parse(await response.json());
    },
    async ledger(
      identifier: string,
      filters: {
        tier?: "t1" | "t2" | "t3";
        search?: string;
        cursor?: string;
        limit?: number;
      } = {},
    ) {
      const query = new URLSearchParams();
      if (filters.tier) query.set("tier", filters.tier);
      if (filters.search) query.set("search", filters.search);
      if (filters.cursor) query.set("cursor", filters.cursor);
      if (filters.limit) query.set("limit", String(filters.limit));
      const suffix = query.size > 0 ? `?${query}` : "";
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/ledger${suffix}`,
      );
      return ledgerListSchema.parse(await response.json());
    },
    async advisoryBatch(input: { behaviorIds: string[]; claimIds: string[] }) {
      const response = await request("/v1/advisories/batch", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return advisoryBatchResponseSchema.parse(await response.json());
    },
    async behaviorLabelProposal(behaviorId: string) {
      const response = await request(
        `/v1/behaviors/${encodeURIComponent(behaviorId)}/label-proposal`,
      );
      return behaviorLabelProposalResponseSchema.parse(await response.json());
    },
    async tierProposal(claimId: string) {
      const response = await request(`/v1/claims/${encodeURIComponent(claimId)}/tier-proposal`);
      return tierProposalResponseSchema.parse(await response.json());
    },
    async requestTierProposal(claimId: string) {
      const response = await request(`/v1/claims/${encodeURIComponent(claimId)}/tier-proposal`, {
        method: "POST",
      });
      return advisoryRunSchema.parse(await response.json());
    },
    async requestBehaviorLabelProposal(behaviorId: string) {
      const response = await request(
        `/v1/behaviors/${encodeURIComponent(behaviorId)}/label-proposal`,
        { method: "POST" },
      );
      return advisoryRunSchema.parse(await response.json());
    },
    async reviewBehaviorLabel(labelId: string, decision: "accept" | "reject") {
      await request(`/v1/behavior-labels/${encodeURIComponent(labelId)}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
    },
    async reviewLedgerEntry(ledgerEntryId: string, input: LedgerReviewRequest) {
      const response = await request(`/v1/ledger/${encodeURIComponent(ledgerEntryId)}/review`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return ledgerReviewResponseSchema.parse(await response.json());
    },
    async receiptAccess(receiptId: string) {
      const response = await request(`/v1/receipts/${encodeURIComponent(receiptId)}/access`, {
        method: "POST",
      });
      return receiptAccessSchema.parse(await response.json());
    },
    async assertions(
      identifier: string,
      filters: { status?: "active" | "expiring" | "expired" | "resolved" | "cancelled" } = {},
    ) {
      const query = new URLSearchParams();
      if (filters.status) query.set("status", filters.status);
      const suffix = query.size > 0 ? `?${query}` : "";
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/assertions${suffix}`,
      );
      return assertionListSchema.parse(await response.json());
    },
    async createAssertion(identifier: string, input: CreateAssertionRequest) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/assertions`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return assertionSchema.parse(await response.json());
    },
    async extendAssertion(assertionId: string, input: ExtendAssertionRequest) {
      const response = await request(`/v1/assertions/${encodeURIComponent(assertionId)}/extend`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return assertionSchema.parse(await response.json());
    },
    async scheduleBreakingChange(assertionId: string, input: ScheduleBreakingChangeRequest) {
      const response = await request(
        `/v1/assertions/${encodeURIComponent(assertionId)}/schedule-break`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return breakingChangePlanSchema.parse(await response.json());
    },
    async resolveAssertion(assertionId: string, input: ResolveAssertionRequest) {
      await request(`/v1/assertions/${encodeURIComponent(assertionId)}/resolve`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async productDraft(planId: string, draftType: "spec_patch" | "customer_notice") {
      const response = await request(
        `/v1/breaking-change-plans/${encodeURIComponent(planId)}/drafts/${draftType}`,
      );
      return generatedDraftResponseSchema.parse(await response.json());
    },
    async assertionSpecPatch(assertionId: string) {
      const response = await request(
        `/v1/assertions/${encodeURIComponent(assertionId)}/spec-patch`,
      );
      return generatedDraftResponseSchema.parse(await response.json());
    },
    async requestAssertionSpecPatch(assertionId: string) {
      const response = await request(
        `/v1/assertions/${encodeURIComponent(assertionId)}/spec-patch`,
        { method: "POST" },
      );
      return advisoryRunSchema.parse(await response.json());
    },
    async requestProductDraft(planId: string, draftType: "spec_patch" | "customer_notice") {
      const response = await request(
        `/v1/breaking-change-plans/${encodeURIComponent(planId)}/drafts/${draftType}`,
        { method: "POST" },
      );
      return advisoryRunSchema.parse(await response.json());
    },
    async reviewProductDraft(draftId: string, decision: "accept" | "reject") {
      await request(`/v1/generated-drafts/${encodeURIComponent(draftId)}/review`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
    },
    async corpora(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/corpora`);
      return replayCorpusWorkspaceSchema.parse(await response.json());
    },
    async buildCorpus(identifier: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/corpora/build`,
        { method: "POST" },
      );
      return corpusBuildResponseSchema.parse(await response.json());
    },
    async corpusAccess(corpusId: string) {
      const response = await request(`/v1/corpora/${encodeURIComponent(corpusId)}/access`, {
        method: "POST",
      });
      return receiptAccessSchema.parse(await response.json());
    },
    async replays(identifier: string) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/replays`);
      return replayRunListSchema.parse(await response.json());
    },
    async replay(identifier: string, replayRunId: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/replays/${encodeURIComponent(replayRunId)}`,
      );
      return replayRunDetailSchema.parse(await response.json());
    },
    async replayImpactExplanation(identifier: string, replayRunId: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/replays/${encodeURIComponent(replayRunId)}/explanation`,
      );
      return replayImpactExplanationResponseSchema.parse(await response.json());
    },
    async requestReplayImpactExplanation(identifier: string, replayRunId: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/replays/${encodeURIComponent(replayRunId)}/explanation`,
        { method: "POST" },
      );
      return advisoryRunSchema.parse(await response.json());
    },
    async createReplay(identifier: string, input: CreateReplayRunRequest) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/replays`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return createReplayRunResponseSchema.parse(await response.json());
    },
    async agentRegistrationDefaults(identifier: string) {
      const response = await request(
        `/v1/services/${encodeURIComponent(identifier)}/agent-registration-defaults`,
      );
      return agentRegistrationDefaultsSchema.parse(await response.json());
    },
    async createAgent(identifier: string, input: CreateAgentRequest) {
      const response = await request(`/v1/services/${encodeURIComponent(identifier)}/agents`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return createAgentResponseSchema.parse(await response.json());
    },
    async privacyRequests() {
      const response = await request("/v1/privacy/requests");
      return dataSubjectRequestListSchema.parse(await response.json());
    },
    async createPrivacyRequest(input: CreateDataSubjectRequest) {
      await request("/v1/privacy/requests", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    async privacyExportDownload(requestId: string) {
      const response = await request(
        `/v1/privacy/requests/${encodeURIComponent(requestId)}/download`,
        { method: "POST" },
      );
      return dataSubjectDownloadSchema.parse(await response.json());
    },
    async platformHealth() {
      const response = await request("/internal/health");
      return platformHealthSchema.parse(await response.json());
    },
    async createSupportGrant(input: CreateSupportGrant) {
      const response = await request("/internal/support-grants", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return supportGrantSchema.parse(await response.json());
    },
    async approveSupportGrant(grantId: string) {
      const response = await request(
        `/internal/support-grants/${encodeURIComponent(grantId)}/approve`,
        { method: "POST" },
      );
      return supportGrantSchema.parse(await response.json());
    },
  };
}
