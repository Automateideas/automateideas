import type { Metadata } from "next";
import { Suspense } from "react";

import { roleLabel } from "@/lib/roles";
import { requireViewer } from "@/lib/viewer";

import { ProfileForm, ProfileSkeleton } from "./profile-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <SettingsGate />
    </Suspense>
  );
}

async function SettingsGate() {
  const viewer = await requireViewer("/settings");
  return (
    <ProfileForm
      name={viewer.user.name}
      email={viewer.user.email}
      phone={viewer.user.phone}
      organizationName={viewer.organization?.name ?? null}
      roleName={viewer.role ? roleLabel(viewer.role) : null}
    />
  );
}
