"use client";

import { LoadError } from "./_components/page-parts";

// Last-resort fallback when a signed-in page crashes while rendering.
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <LoadError
      title="Something went wrong"
      message="This page hit an unexpected error. Try again, and if it keeps happening, reload the page."
      onRetry={retry}
    />
  );
}
