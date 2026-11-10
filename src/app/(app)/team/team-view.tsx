"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, LinkIcon, MailIcon, SendIcon, UsersIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, useApiQuery } from "@/lib/api";
import {
  ROLE_LABELS,
  assignableRoles,
  canManageRole,
  parseRoles,
  roleLabel,
  type InvitableRole,
} from "@/lib/roles";
import { cn } from "@/lib/utils";
import { isEmail } from "@/app/(auth)/_lib/validate";

import { LoadError, PageHeader } from "../_components/page-parts";
import { MembersTable, type TeamMember } from "./members-table";

type TeamData = {
  members: TeamMember[];
  invitations: { id: string; email: string; role: string; expiresAt: string; invitedAt: string }[];
  seats: { limit: number; used: number; members: number; pendingInvites: number };
};

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function TeamView({
  currentUserId,
  viewerRoles,
  canManageSubscription,
}: {
  currentUserId: string;
  /** The signed-in user's roles; decides which roles they can invite and remove. */
  viewerRoles: string[];
  canManageSubscription: boolean;
}) {
  const team = useApiQuery<TeamData>("/api/team");
  const inviteRoles = assignableRoles(viewerRoles);
  const canActOn = (role: string) => canManageRole(viewerRoles, role);

  if (team.status === "loading") return <TeamSkeleton />;
  if (!team.data) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Team" description="Invite people and manage who has access." />
        <LoadError message={team.error.message} onRetry={team.reload} />
      </div>
    );
  }

  const { members, invitations, seats } = team.data;
  const full = seats.used >= seats.limit;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Team" description="Invite people and manage who has access.">
        <SeatCount seats={seats} />
      </PageHeader>

      {team.status === "error" ? (
        <LoadError title="Couldn't refresh the team" message={team.error.message} onRetry={team.reload} />
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6 lg:order-1">
          <MembersCard
            members={members}
            currentUserId={currentUserId}
            canActOn={canActOn}
            onChange={team.reload}
          />
          <InvitesCard invitations={invitations} canActOn={canActOn} onChange={team.reload} />
        </div>
        <div className="order-first flex flex-col gap-6 lg:order-2">
          {full ? <SeatsFullAlert seats={seats} canManageSubscription={canManageSubscription} /> : null}
          <InviteCard roles={inviteRoles} disabled={full} onInvited={team.reload} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Seats ---------------- */

function SeatCount({ seats }: { seats: TeamData["seats"] }) {
  const pct = Math.min(100, Math.round((seats.used / Math.max(seats.limit, 1)) * 100));
  return (
    <div className="flex min-w-48 flex-col gap-2">
      <p className="text-sm">
        <span className="font-semibold tabular-nums">
          {seats.used} / {seats.limit}
        </span>{" "}
        <span className="text-muted-foreground">seats used</span>
      </p>
      <div
        role="progressbar"
        aria-label="Seats used"
        aria-valuemin={0}
        aria-valuemax={seats.limit}
        aria-valuenow={seats.used}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", seats.used >= seats.limit ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {seats.members} {seats.members === 1 ? "member" : "members"}, {seats.pendingInvites} pending{" "}
        {seats.pendingInvites === 1 ? "invite" : "invites"}
      </p>
    </div>
  );
}

function SeatsFullAlert({
  seats,
  canManageSubscription,
}: {
  seats: TeamData["seats"];
  canManageSubscription: boolean;
}) {
  return (
    <Alert>
      <UsersIcon />
      <AlertTitle>All {seats.limit} seats are in use</AlertTitle>
      <AlertDescription>
        {canManageSubscription
          ? "Add seats or cancel a pending invite to invite someone new."
          : "Cancel a pending invite, or ask an owner or admin to add seats."}
      </AlertDescription>
      {canManageSubscription ? (
        // Outside AlertDescription, which underlines every link inside it.
        <div className="col-start-2 mt-3">
          <Button size="sm" render={<Link href="/subscription/plans" />} nativeButton={false}>
            Upgrade seats
          </Button>
        </div>
      ) : null}
    </Alert>
  );
}

/* ---------------- Invite form ---------------- */

const ROLE_HELP: Record<InvitableRole, string> = {
  member: "Employees use the app but can't manage the team or change your plan.",
  manager: "Managers can invite and remove employees, but can't change your plan or seats.",
  admin: "Admins can invite and remove anyone except the owner, and change your plan and seats.",
};

// Least access first, so the default is the safest choice.
const ROLE_ORDER: InvitableRole[] = ["member", "manager", "admin"];

function InviteCard({
  roles,
  disabled,
  onInvited,
}: {
  /** Roles this user may invite (managers: member only). */
  roles: InvitableRole[];
  disabled: boolean;
  onInvited: () => void;
}) {
  const options = ROLE_ORDER.filter((r) => roles.includes(r));
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>(options[0] ?? "member");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSentTo(null);
    setFormError(null);
    if (!isEmail(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      try {
        await api("/api/team/invitations", { method: "POST", json: { email: email.trim(), role } });
        setSentTo(email.trim().toLowerCase());
        setEmail("");
        onInvited();
      } catch (error) {
        const err = error instanceof ApiError ? error : null;
        setFormError(err?.message ?? "Couldn't send the invite. Try again.");
        // Seat or plan limits changed on the server; refresh the counts.
        if (err?.code === "SEAT_LIMIT_REACHED" || err?.code === "PLAN_INACTIVE") onInvited();
      }
    });
  }

  const off = disabled || pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite member</CardTitle>
        <CardDescription>They&apos;ll get an email with a link to join. Invites expire after 3 days.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!emailError} data-disabled={disabled || undefined}>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!emailError}
                disabled={disabled}
              />
              <FieldError>{emailError}</FieldError>
            </Field>

            <Field data-disabled={disabled || undefined}>
              <FieldLabel id="invite-role-label">Role</FieldLabel>
              {options.length > 1 ? (
                <ToggleGroup
                  aria-labelledby="invite-role-label"
                  variant="outline"
                  spacing={0}
                  className="w-full"
                  value={[role]}
                  onValueChange={(v: string[]) => v[0] && setRole(v[0] as InvitableRole)}
                  disabled={disabled}
                >
                  {options.map((r) => (
                    <ToggleGroupItem key={r} value={r} className="flex-1">
                      {ROLE_LABELS[r]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : (
                // Managers can only invite employees, so there's nothing to choose.
                <p className="text-sm font-medium">{ROLE_LABELS[role]}</p>
              )}
              <FieldDescription>{ROLE_HELP[role]}</FieldDescription>
            </Field>

            {formError ? <FieldError>{formError}</FieldError> : null}
            {sentTo ? (
              <p role="status" className="text-sm text-primary">
                Invite created for {sentTo}. Use “Copy link” under Pending invites to share it directly.
              </p>
            ) : null}

            <Button type="submit" disabled={off}>
              {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
              Send invite
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

/* ---------------- Members ---------------- */

function MembersCard({
  members,
  currentUserId,
  canActOn,
  onChange,
}: {
  members: TeamData["members"];
  currentUserId: string;
  canActOn: (role: string) => boolean;
  onChange: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>No members yet</EmptyTitle>
              <EmptyDescription>Invite someone to get started.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MembersTable
            members={members}
            currentUserId={currentUserId}
            action={(m) =>
              parseRoles(m.role).includes("owner") || m.userId === currentUserId || !canActOn(m.role) ? null : (
                <RemoveMember member={m} onRemoved={onChange} />
              )
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function RemoveMember({ member, onRemoved }: { member: TeamData["members"][number]; onRemoved: () => void }) {
  return (
    <ConfirmAction
      triggerLabel="Remove"
      triggerAriaLabel={`Remove ${member.name}`}
      title={`Remove ${member.name}?`}
      description={`${member.email} will lose access to this workspace right away. Their seat becomes free.`}
      confirmLabel="Remove member"
      run={() => api(`/api/team/members/${member.id}`, { method: "DELETE" })}
      onDone={onRemoved}
    />
  );
}

/* ---------------- Pending invites ---------------- */

function InvitesCard({
  invitations,
  canActOn,
  onChange,
}: {
  invitations: TeamData["invitations"];
  canActOn: (role: string) => boolean;
  onChange: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invites</CardTitle>
        <CardDescription>Each pending invite holds a seat until it&apos;s accepted, cancelled or expires.</CardDescription>
      </CardHeader>
      <CardContent>
        {invitations.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MailIcon />
              </EmptyMedia>
              <EmptyTitle>No pending invites</EmptyTitle>
              <EmptyDescription>Invites you send show up here until they&apos;re accepted.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{inv.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {roleLabel(inv.role)}, expires {dateFormat.format(new Date(inv.expiresAt))}
                  </span>
                </div>
                <CopyInviteLink id={inv.id} email={inv.email} />
                {canActOn(inv.role) ? (
                  <ConfirmAction
                    triggerLabel="Cancel"
                    triggerAriaLabel={`Cancel invite for ${inv.email}`}
                    title="Cancel this invite?"
                    description={`The link sent to ${inv.email} will stop working and the seat becomes free.`}
                    confirmLabel="Cancel invite"
                    cancelLabel="Keep invite"
                    run={() => api(`/api/team/invitations/${inv.id}`, { method: "DELETE" })}
                    onDone={onChange}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Copies the invite's accept link, so it can be shared directly (WhatsApp,
 * chat) when emails aren't being sent yet or didn't arrive.
 */
function CopyInviteLink({ id, email }: { id: string; email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/accept-invite/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (e.g. not HTTPS): let the user copy it by hand.
      window.prompt("Copy this invite link:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy invite link for ${email}`}>
      {copied ? <CheckIcon data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
    </Button>
  );
}

/* ---------------- Shared confirm dialog ---------------- */

function ConfirmAction({
  triggerLabel,
  triggerAriaLabel,
  title,
  description,
  confirmLabel,
  cancelLabel = "Go back",
  run,
  onDone,
}: {
  triggerLabel: string;
  triggerAriaLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  run: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await run();
        setOpen(false);
        onDone();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" aria-label={triggerAriaLabel} />}
      >
        {triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- Loading ---------------- */

export function TeamSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading team">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
