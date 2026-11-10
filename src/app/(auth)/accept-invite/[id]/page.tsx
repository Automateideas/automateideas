import type { Metadata } from "next";
import { Suspense } from "react";

import { AcceptInvite, AcceptInviteSkeleton } from "./accept-invite";

export const metadata: Metadata = {
  title: "Accept invite",
};

export default function AcceptInvitePage({ params }: PageProps<"/accept-invite/[id]">) {
  return (
    <Suspense fallback={<AcceptInviteSkeleton />}>
      <AcceptInviteWithId params={params} />
    </Suspense>
  );
}

async function AcceptInviteWithId({ params }: { params: PageProps<"/accept-invite/[id]">["params"] }) {
  const { id } = await params;
  return <AcceptInvite id={id} />;
}
