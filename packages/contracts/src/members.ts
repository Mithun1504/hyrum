import { z } from "zod";
import { organizationRoleSchema } from "./auth";

export const memberStatusSchema = z.enum(["invited", "active", "suspended", "revoked"]);

export const organizationMemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  role: organizationRoleSchema,
  status: memberStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

export const invitationStatusSchema = z.enum(["pending", "accepted", "expired", "revoked"]);
export const organizationInvitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: organizationRoleSchema,
  status: invitationStatusSchema,
  invitedByMembershipId: z.uuid(),
  expiresAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>;

export const memberDirectorySchema = z.object({
  members: z.array(organizationMemberSchema),
  invitations: z.array(organizationInvitationSchema),
});
export type MemberDirectory = z.infer<typeof memberDirectorySchema>;

export const assignableOrganizationRoleSchema = z.enum(["admin", "engineer", "viewer"]);
export const inviteMemberRequestSchema = z.object({
  email: z.email(),
  role: assignableOrganizationRoleSchema,
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const updateMemberRoleRequestSchema = z.object({
  role: assignableOrganizationRoleSchema,
});
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

export const updateMemberStatusRequestSchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type UpdateMemberStatusRequest = z.infer<typeof updateMemberStatusRequestSchema>;

export const memberPathParamsSchema = z.object({ membershipId: z.uuid() });
export const invitationPathParamsSchema = z.object({ invitationId: z.uuid() });

export const transferOwnershipRequestSchema = z.object({
  targetMembershipId: z.uuid(),
});
export type TransferOwnershipRequest = z.infer<typeof transferOwnershipRequestSchema>;
