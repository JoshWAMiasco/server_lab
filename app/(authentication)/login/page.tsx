import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthenticationFrame } from "@/components/authentication/authentication-frame";
import { SignInForm } from "@/components/authentication/sign-in-form";
import { hasAdminAccount, readSession } from "@/lib/authentication/require-session";
import { readSafeNextPath } from "@/lib/authentication/safe-next-path";

export const metadata: Metadata = { title: "Sign In" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!hasAdminAccount()) redirect("/setup");
  const { next: nextPath } = await searchParams;
  if (await readSession()) redirect(readSafeNextPath(nextPath));
  return (
    <AuthenticationFrame title="Sign In" prompt="Enter the ServerLab admin password.">
      <SignInForm nextPath={readSafeNextPath(nextPath)} />
    </AuthenticationFrame>
  );
}
