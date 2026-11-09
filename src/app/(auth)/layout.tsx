import Image from "next/image";
import Link from "next/link";

import { Showcase } from "./_components/showcase";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-2 lg:gap-4 lg:p-4">
      <aside className="hidden rounded-3xl bg-muted p-10 lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-2rem)] lg:flex-col lg:gap-12 xl:p-14">
        <Link href="/" className="w-fit" aria-label="Automate Ideas home">
          <Image src="/BL.png" alt="Automate Ideas" width={2420} height={380} priority className="h-9 w-auto" />
        </Link>
        <Showcase />
      </aside>

      <main className="flex flex-col items-center px-4 py-10 sm:px-10 lg:justify-center lg:py-12">
        <div className="flex w-full max-w-105 flex-col gap-8">
          <Link href="/" className="mx-auto lg:hidden" aria-label="Automate Ideas home">
            <Image src="/BL.png" alt="Automate Ideas" width={2420} height={380} priority className="h-9 w-auto" />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
