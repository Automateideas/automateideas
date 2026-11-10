import Link from "next/link";
import { Building2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { billingSection } from "./sections";

/** Empty state for a Billing section whose feature isn't built yet. */
export function SectionPlaceholder({ slug }: { slug: string }) {
  const { Icon, empty } = billingSection(slug);
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="flex flex-wrap items-center justify-center gap-2">
          {empty.title}
          <Badge variant="secondary">Coming soon</Badge>
        </EmptyTitle>
        <EmptyDescription>{empty.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link href="/billing/settings" />} nativeButton={false}>
          <Building2Icon data-icon="inline-start" />
          Company details
        </Button>
      </EmptyContent>
    </Empty>
  );
}
