import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { requireViewer } from "@/lib/viewer";

import { TeamDirectory } from "./team-directory";
import { TeamSkeleton, TeamView } from "./team-view";

export const metadata: Metadata = {
  title: "Team",
};

export default function TeamPage() {
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamGate />
    </Suspense>
  );
}

// Owners, admins and managers get the full Team page (invites, seats, remove).
// Employees get a read-only list of who's on the team.
async function TeamGate() {
  const viewer = await requireViewer("/team");
  // Signed in but not in any organization yet (e.g. hasn't accepted an invite).
  if (!viewer.role) redirect("/dashboard");

  if (!viewer.canManageTeam) return <TeamDirectory currentUserId={viewer.user.id} />;

  return (
    <TeamView
      currentUserId={viewer.user.id}
      viewerRoles={viewer.roles}
      canManageSubscription={viewer.canManageSubscription}
    />
  );
}
