"use client";

/**
 * Team card on /settings (Step 15): the workspace roster, plus — for
 * owners only — invite management, role management (Step 22), and
 * removal (Step 21), and — for everyone on their own row — Leave
 * (Step 26). Invite delivery (Step 23, revised — plain SMTP):
 * when the SMTP_* env vars are set the invite link is emailed to the
 * invitee through the owner's own mail account, and copy-link stays as
 * the fallback (no config = silent skip; failed send = warning + the
 * copy link). Members see the roster read-only with ZERO
 * management controls rendered (hide-don't-disable; the server actions
 * and RLS re-gate the same checks).
 *
 * Destructive / role controls use the same inline two-click confirm as
 * template delete and invite revoke. Absolute invite URLs resolve
 * window.location.origin after mount — ShareLinkPanel precedent (SSR
 * renders nothing url-shaped, so no hydration mismatch and the copy
 * button needs no placeholder).
 */

import { useEffect, useState } from "react";
import { useOrigin } from "@/lib/use-origin";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useMotionItems } from "@/components/ui/motion-rows";
import {
  Users,
  Ban,
  Check,
  Copy,
  Loader2,
  LogOut,
  Trash2,
  UserPlus,
} from "lucide-react";

import {
  changeMemberRoleAction,
  createTeamInviteAction,
  leaveWorkspaceAction,
  removeMemberAction,
  revokeTeamInviteAction,
} from "@/app/(app)/settings/team-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PendingInvite, TeamMember } from "@/lib/data/team";
import { formatDate, getInitials } from "@/lib/utils";

function MemberRow({
  member,
  rowClass,
  leaving,
  removable,
  roleOptions,
  leavable,
}: {
  member: TeamMember;
  /** Extra classes for list enter/leave motion (Step 33). */
  rowClass?: string;
  /** True while the row animates out (aria-hidden + collapse). */
  leaving?: boolean;
  /** True when the viewer (an owner) may remove this member: not their
   *  own row, and not the workspace's last owner. */
  removable: boolean;
  /** Roles the viewer (an owner) may switch this member TO (Step 22/29):
   *  never their own row, never the last owner, never the member's
   *  current role. Empty = no role control. */
  roleOptions: Array<"owner" | "member" | "viewer">;
  /** True when this is the VIEWER'S OWN row and they may leave (anyone
   *  but the workspace's last owner — Step 26). */
  leavable: boolean;
}) {
  const initials =
    member.avatar_initials || getInitials(member.full_name ?? "?");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRole, setConfirmingRole] = useState(false);
  const [pendingRole, setPendingRole] = useState<
    "owner" | "member" | "viewer" | null
  >(null);
  const [rolePending, setRolePending] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRemove() {
    setPending(true);
    setError(null);
    const result = await removeMemberAction({ userId: member.user_id });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
    } else {
      // revalidatePath alone does not re-render the calling page's flight
      // payload here — refresh() lands the new roster so the row can animate.
      router.refresh();
    }
  }

  async function handleRoleChange() {
    if (!pendingRole) return;
    setRolePending(true);
    setRoleError(null);
    const result = await changeMemberRoleAction({
      userId: member.user_id,
      role: pendingRole,
    });
    setRolePending(false);
    if (result?.error) {
      setRoleError(result.error);
      setConfirmingRole(false);
    } else {
      router.refresh();
    }
  }

  async function handleLeave() {
    setLeavePending(true);
    setLeaveError(null);
    const result = await leaveWorkspaceAction();
    setLeavePending(false);
    if (result?.error) {
      setLeaveError(result.error);
      setConfirmingLeave(false);
    }
    // On success the shell revalidates into the next workspace (or
    // /onboarding when none remain) — this card unmounts with it.
  }

  const roleLabel = member.role === "viewer" ? "View only" : member.role;

  return (
    <li
      aria-hidden={leaving || undefined}
      className={`py-3 first:pt-0 last:pb-0${rowClass ? ` ${rowClass}` : ""}`}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-accent text-xs font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug">
            {member.full_name ?? "Unnamed user"}
          </p>
          <p className="text-xs text-muted-foreground">
            Joined {formatDate(member.joined_at)}
          </p>
        </div>
        <Badge variant={member.role === "owner" ? "default" : "secondary"}>
          {roleLabel}
        </Badge>

        {roleOptions.length > 0 && !confirmingRole && !confirming && (
          <select
            className="min-h-11 shrink-0 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
            value=""
            onChange={(e) => {
              const value = e.target.value;
              if (value === "owner" || value === "member" || value === "viewer") {
                setPendingRole(value);
                setConfirmingRole(true);
              }
            }}
            aria-label={`Change role for ${member.full_name ?? "member"}`}
          >
            <option value="">Change role…</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r === "viewer" ? "Viewer" : r === "owner" ? "Owner" : "Member"}
              </option>
            ))}
          </select>
        )}

        {removable && !confirming && !confirmingRole && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-error"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${member.full_name ?? "member"}`}
          >
            <Trash2 className="h-3.5 w-3.5"  aria-hidden="true" />
          </Button>
        )}

        {pendingRole && confirmingRole && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Make {pendingRole === "viewer" ? "viewer" : pendingRole}?
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmingRole(false);
                setPendingRole(null);
              }}
              disabled={rolePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={pendingRole === "owner" ? "default" : "destructive"}
              size="sm"
              onClick={handleRoleChange}
              disabled={rolePending}
            >
              {rolePending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"  aria-hidden="true" />
              )}
              Make {pendingRole === "viewer" ? "viewer" : pendingRole}
            </Button>
          </div>
        )}

        {removable && confirming && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Remove?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={pending}
            >
              {pending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"  aria-hidden="true" />
              )}
              Remove
            </Button>
          </div>
        )}

        {leavable && !confirmingLeave && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setConfirmingLeave(true)}
            aria-label="Leave workspace"
          >
            <LogOut className="h-3.5 w-3.5"  aria-hidden="true" />
          </Button>
        )}

        {leavable && confirmingLeave && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Leave?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingLeave(false)}
              disabled={leavePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleLeave}
              disabled={leavePending}
            >
              {leavePending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"  aria-hidden="true" />
              )}
              Leave workspace
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
      {roleError && <p className="mt-1 text-xs text-error">{roleError}</p>}
      {leaveError && <p className="mt-1 text-xs text-error">{leaveError}</p>}
    </li>
  );
}

function InviteRow({
  invite,
  origin,
}: {
  invite: PendingInvite;
  origin: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const url = `${origin ?? ""}/invite/${invite.token}`;

  async function handleCopy() {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Invite link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select and copy the link manually.");
    }
  }

  async function handleRevoke() {
    setPending(true);
    setError(null);
    const result = await revokeTeamInviteAction({ inviteId: invite.id });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
    } else {
      router.refresh();
    }
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-snug">
            {invite.email}
          </p>
          <p className="text-xs text-muted-foreground">
            Expires {formatDate(invite.expires_at)}
          </p>
        </div>

        {!confirming && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!origin}
              aria-label={`Copy invite link for ${invite.email}`}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5"  aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5"  aria-hidden="true" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-error hover:text-error"
              onClick={() => setConfirming(true)}
              aria-label={`Revoke invite for ${invite.email}`}
            >
              <Ban className="h-3.5 w-3.5"  aria-hidden="true" />
            </Button>
          </div>
        )}

        {confirming && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Revoke?</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRevoke}
              disabled={pending}
            >
              {pending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"  aria-hidden="true" />
              )}
              Revoke
            </Button>
          </div>
        )}
      </div>
      {origin && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{url}</p>
      )}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </li>
  );
}

export function TeamCard({
  members,
  pendingInvites,
  isOwner,
  currentUserId,
}: {
  members: TeamMember[];
  pendingInvites: PendingInvite[];
  isOwner: boolean;
  /** The signed-in user's id — their own row gets Leave (Step 26)
   *  instead of a remove control. */
  currentUserId: string | null;
}) {
  const origin = useOrigin() || null;
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const [warning, setWarning] = useState<string | null>(null);



  // The last owner can never be removed (a workspace must keep one
  // owner); every other member's row is removable for owners.
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isRemovable = (member: TeamMember) =>
    isOwner &&
    member.user_id !== currentUserId &&
    !(member.role === "owner" && ownerCount === 1);

  // Role changes (Step 22/29): owners can set anyone else's role among
  // owner / member / viewer — except their own row (self-guard) and the
  // workspace's last owner (every option would demote them).
  const roleOptionsFor = (
    member: TeamMember
  ): Array<"owner" | "member" | "viewer"> => {
    if (!isOwner || member.user_id === currentUserId) return [];
    if (member.role === "owner" && ownerCount === 1) return [];
    return (["owner", "member", "viewer"] as const).filter(
      (r) => r !== member.role
    );
  };

  // Leaving (Step 26): the viewer's own row, anyone but the last owner.
  const isLeavable = (member: TeamMember) =>
    member.user_id === currentUserId &&
    !(member.role === "owner" && ownerCount === 1);

  const memberRows = useMotionItems(members.map((member) => ({ id: member.user_id, member })), 220, "settings-roster");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setWarning(null);
    const result = await createTeamInviteAction({ email });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (result?.warning) {
      // The invite exists (and shows in the list with its copy link) —
      // the email just didn't go out.
      setWarning(result.warning);
    }
    toast("Invite created");
    setEmail("");
    router.refresh(); // the new invite appears in the list
  }

  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip icon-chip-muted h-8 w-8">
            <Users className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Team</CardTitle>
        </div>
        <CardDescription>
          Everyone who can see this workspace.{" "}
          {!isOwner && (
            <span className="italic">
              View only — owners manage invites, roles, and removals.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <ul className="divide-y divide-border">
          {memberRows.map(({ item, leaving }) => (
            <MemberRow
              key={item.id}
              member={item.member}
              removable={isRemovable(item.member)}
              roleOptions={roleOptionsFor(item.member)}
              leavable={isLeavable(item.member)}
              rowClass={leaving ? "animate-row-out overflow-hidden" : "animate-rise-in"}
              leaving={leaving}
            />
          ))}
        </ul>

        {isOwner && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-medium">Invite a teammate</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              They’ll join as a member. The link is emailed to them when
              SMTP is configured — otherwise copy it below and send it
              yourself.
            </p>
            <form onSubmit={handleCreate} className="mt-3 flex gap-2">
              <Input
                type="email"
                required
                placeholder="teammate@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Teammate email"
              />
              <Button type="submit" disabled={pending} className="shrink-0">
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"  aria-hidden="true" />
                ) : (
                  <UserPlus className="mr-1.5 h-3.5 w-3.5"  aria-hidden="true" />
                )}
                Create invite
              </Button>
            </form>
            {error && <p className="mt-2 text-sm text-error">{error}</p>}
            {warning && (
              <p className="mt-2 text-sm text-muted-foreground">{warning}</p>
            )}

            {pendingInvites.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pending invites
                </p>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border px-3">
                  {pendingInvites.map((invite) => (
                    <InviteRow
                      key={invite.id}
                      invite={invite}
                      origin={origin}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
