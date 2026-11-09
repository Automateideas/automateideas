"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";

export function GoogleButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      // TODO(backend): start Google OAuth.
      onClick={() => {}}
    >
      <Image src="/google.svg" alt="" width={16} height={16} data-icon="inline-start" />
      {label}
    </Button>
  );
}
