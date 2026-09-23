"use client";

/**
 * Team card on /settings (Step 15): the workspace roster, plus — for
 * owners only — invite management. Delivery is copy-link (no email is
 * sent anywhere): the owner creates a targeted invite, copies its URL,
 * and sends it through their own mail/chat. Members see the roster
 * read-only with ZERO invite controls rendered (hide-don't-disable; the
 * server actions and RLS re-gate the same checks).
 *
 * Revoke uses the same inline two-click confirm as template delete.
 * Absolute invite URLs resolve window.location.origin after mount —
 * ShareLinkPanel precedent (SSR renders nothing url-shaped, so no
 * hydration mismatch and the copy button needs no placeholder).
 */

import { useEffect, useState } from "react";
import { Ban, Check, Copy, Loader2, Trash2, UserPlus } from "lucide-react";

import {
  createTeamInviteAction,
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
  removable,
}: {
  member: TeamMember;
  /** True when the viewer (an owner) may remove this member: not their
   *  own row, and not the workspace's last owner. */
  removable: boolean;
}) {
  const initials =
    member.avatar_initials || getInitials(member.full_name ?? "?");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    setPending(true);
    setError(null);
    const result = await removeMemberAction({ userId: member.user_id });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      setConfirming(false);
    }
    // On success the row disappears via revalidated server props.
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
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
          {member.role}
        </Badge>

        {removable && !confirming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-error"
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${member.full_name ?? "member"}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
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
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Remove
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
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
  const [error, setError] = useState<string | null>(null);

  const url = `${origin ?? ""}/invite/${invite.token}`;

  async function handleCopy() {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
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
    }
    // On success the row disappears via revalidated server props.
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
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
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
              <Ban className="h-3.5 w-3.5" />
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
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
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
  /** The signed-in user's id — their own row never gets a remove
   *  control (self-removal is "leaving", a different, unbuilt action). */
  currentUserId: string | null;
}) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // The last owner can never be removed (a workspace must keep one
  // owner); every other member's row is removable for owners.
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isRemovable = (member: TeamMember) =>
    isOwner &&
    member.user_id !== currentUserId &&
    !(member.role === "owner" && ownerCount === 1);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await createTeamInviteAction({ email });
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEmail(""); // the new invite appears in the list via revalidation
  }

  return (
    <Card>
      <CardHeader className="space-y-1 border-b border-border px-5 py-3.5">
        <CardTitle className="text-base">Team</CardTitle>
        <CardDescription>
          Everyone who can see this workspace.{" "}
          {!isOwner && (
            <span className="italic">
              View only — owners manage invites and removals.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <MemberRow
              key={member.user_id}
              member={member}
              removable={isRemovable(member)}
            />
          ))}
        </ul>

        {isOwner && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm font-medium">Invite a teammate</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              They’ll join as a member. No email is sent — copy the link and
              send it yourself.
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
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Create invite
              </Button>
            </form>
            {error && <p className="mt-2 text-sm text-error">{error}</p>}

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
