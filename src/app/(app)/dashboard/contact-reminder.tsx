import Link from "next/link";
import { PhoneIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/viewer";

// Shown to people without a contact number (Google sign-ups, older accounts),
// since the Team page shows everyone's number.
export async function ContactReminder() {
  const viewer = await getViewer();
  if (!viewer || viewer.user.phone) return null;

  return (
    <Alert>
      <PhoneIcon />
      <AlertTitle>Add your contact number</AlertTitle>
      <AlertDescription>Your team sees it on the Team page, so they can reach you.</AlertDescription>
      {/* Outside AlertDescription, which underlines every link inside it. */}
      <div className="col-start-2 mt-3">
        <Button size="sm" render={<Link href="/settings" />} nativeButton={false}>
          Add contact number
        </Button>
      </div>
    </Alert>
  );
}
