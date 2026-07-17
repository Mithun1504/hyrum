"use client";

import type { MemberDirectory, OrganizationInvitation, OrganizationMember } from "@hyrum/contracts";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inviteMember,
  type MemberActionState,
  resendInvitation,
  revokeInvitation,
  transferOwnership,
  updateMemberRole,
  updateMemberStatus,
} from "./actions";

const initialActionState: MemberActionState = { status: "idle" };

function SubmitButton({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "outline" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

function ActionFeedback({ state }: { state: MemberActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const Icon = state.status === "success" ? CheckCircle2 : AlertCircle;
  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"} aria-live="polite">
      <Icon aria-hidden="true" />
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function InviteMemberForm() {
  const [state, action] = useActionState(inviteMember, initialActionState);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_7rem_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email address</Label>
          <Input id="invite-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select name="role" defaultValue="engineer">
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="engineer">Engineer</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-expiry">Expires</Label>
          <Select name="expiresInDays" defaultValue="7">
            <SelectTrigger id="invite-expiry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 days</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <SubmitButton>
          <UserPlus aria-hidden="true" /> Invite
        </SubmitButton>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}

function MemberRoleForm({ member }: { member: OrganizationMember }) {
  const [state, action] = useActionState(updateMemberRole, initialActionState);
  return (
    <div className="space-y-2">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="membershipId" value={member.id} />
        <Select name="role" defaultValue={member.role}>
          <SelectTrigger className="w-32" aria-label={`Role for ${member.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="engineer">Engineer</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <SubmitButton variant="outline">Save</SubmitButton>
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}

function MemberStatusForm({ member }: { member: OrganizationMember }) {
  const [state, action] = useActionState(updateMemberStatus, initialActionState);
  const nextStatus = member.status === "suspended" ? "active" : "suspended";
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="membershipId" value={member.id} />
        <input type="hidden" name="status" value={nextStatus} />
        <SubmitButton variant={nextStatus === "suspended" ? "destructive" : "outline"}>
          {nextStatus === "suspended" ? "Suspend" : "Restore"}
        </SubmitButton>
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}

function OwnershipForm({ candidates }: { candidates: OrganizationMember[] }) {
  const [state, action] = useActionState(transferOwnership, initialActionState);
  if (candidates.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer ownership</CardTitle>
        <CardDescription>
          The selected member becomes owner and your role becomes admin. Recent authentication is
          required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select name="targetMembershipId" defaultValue={candidates[0]?.id}>
            <SelectTrigger className="w-full sm:max-w-sm" aria-label="New organization owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.displayName ?? member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SubmitButton variant="outline">Transfer ownership</SubmitButton>
        </form>
        <div className="mt-3">
          <ActionFeedback state={state} />
        </div>
      </CardContent>
    </Card>
  );
}

function InvitationActions({ invitation }: { invitation: OrganizationInvitation }) {
  const [resendState, resendAction] = useActionState(resendInvitation, initialActionState);
  const [revokeState, revokeAction] = useActionState(revokeInvitation, initialActionState);
  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <SubmitButton variant="outline">Resend</SubmitButton>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="invitationId" value={invitation.id} />
          <SubmitButton variant="destructive">Revoke</SubmitButton>
        </form>
      </div>
      <ActionFeedback state={resendState.status !== "idle" ? resendState : revokeState} />
    </div>
  );
}

export function MemberDirectoryView({
  directory,
  currentMembershipId,
  canInvite,
  canManage,
  isOwner,
}: {
  directory: MemberDirectory;
  currentMembershipId: string;
  canInvite: boolean;
  canManage: boolean;
  isOwner: boolean;
}) {
  const ownershipCandidates = directory.members.filter(
    (member) => member.status === "active" && member.role !== "owner",
  );
  return (
    <div className="space-y-6">
      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite a member</CardTitle>
            <CardDescription>
              Invitations are delivered and accepted through WorkOS AuthKit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {directory.members.length} people have a workspace record.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                {canManage ? <TableHead className="text-right">Access</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {directory.members.map((member) => {
                const editable = canManage && member.role !== "owner";
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">{member.displayName ?? member.email}</div>
                      {member.displayName ? (
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={member.status === "active" ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {member.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <MemberRoleForm member={member} />
                      ) : (
                        <span className="capitalize">{member.role}</span>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        {editable && member.id !== currentMembershipId ? (
                          <MemberStatusForm member={member} />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {directory.invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
            <CardDescription>
              Pending and historical invitations for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  {canInvite ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {directory.invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell className="capitalize">{invitation.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {invitation.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                        new Date(invitation.expiresAt),
                      )}
                    </TableCell>
                    {canInvite ? (
                      <TableCell className="text-right">
                        {invitation.status === "pending" ? (
                          <InvitationActions invitation={invitation} />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {isOwner ? <OwnershipForm candidates={ownershipCandidates} /> : null}
    </div>
  );
}
