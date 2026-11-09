import type { Metadata } from "next";
import Link from "next/link";

import { Separator } from "@/components/ui/separator";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <>
      <header className="flex flex-col gap-2 text-center lg:text-left">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1>
        <p className="text-muted-foreground">Log in to manage your business.</p>
      </header>

      <LoginForm />

      <Separator />

      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:underline hover:underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
