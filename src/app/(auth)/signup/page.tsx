import type { Metadata } from "next";
import Link from "next/link";

import { Separator } from "@/components/ui/separator";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account",
};

export default function SignupPage() {
  return (
    <>
      <header className="flex flex-col gap-2 text-center lg:text-left">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Create your account</h1>
        <p className="text-muted-foreground">Set up your business on Automate Ideas.</p>
      </header>

      <SignupForm />

      <Separator />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline hover:underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}
