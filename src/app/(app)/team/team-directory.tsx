"use client";

import { UsersIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useApiQuery } from "@/lib/api";

import { LoadError, PageHeader } from "../_components/page-parts";
import { MembersTable, type TeamMember } from "./members-table";
import { TeamSkeleton } from "./team-view";

/** Read-only team list for employees: who's on the team and how to reach them. */
export function TeamDirectory({ currentUserId }: { currentUserId: string }) {
  const team = useApiQuery<{ members: TeamMember[] }>("/api/team/members");
  const header = <PageHeader title="Team" description="Everyone in your workspace and how to reach them." />;

  if (team.status === "loading") return <TeamSkeleton />;
  if (!team.data) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <LoadError message={team.error.message} onRetry={team.reload} />
      </div>
    );
  }

  const { members } = team.data;

  return (
    <div className="flex flex-col gap-8">
      {header}
      {team.status === "error" ? (
        <LoadError title="Couldn't refresh the team" message={team.error.message} onRetry={team.reload} />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "person" : "people"} in your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>No one here yet</EmptyTitle>
                <EmptyDescription>People your admins invite show up here once they join.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MembersTable members={members} currentUserId={currentUserId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
