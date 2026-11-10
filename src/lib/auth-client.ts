import { createAuthClient } from "better-auth/react";
import { oneTapClient, organizationClient } from "better-auth/client/plugins";

import { ac, orgRoles } from "@/lib/roles";

// Browser-side client for sign-up, login, Google and session reads.
// Team, subscription and billing actions go through /api/team, /api/invitations,
// /api/subscription and /api/business-billing.
export const authClient = createAuthClient({
  plugins: [
    organizationClient({ ac, roles: orgRoles }),
    oneTapClient({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      autoSelect: false,
      cancelOnTapOutside: true,
      context: "signin",
      promptOptions: {
        baseDelay: 1000,
        maxAttempts: 5,
      },
    }),
  ],
});
