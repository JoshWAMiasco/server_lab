import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthenticationFrame } from "@/components/authentication/authentication-frame";
import { SetupForm } from "@/components/authentication/setup-form";
import { hasAdminAccount } from "@/lib/authentication/require-session";
import { readSetupToken } from "@/lib/authentication/setup-token";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (hasAdminAccount()) notFound();
  readSetupToken();
  return (
    <AuthenticationFrame title="First-run setup" prompt="Create the admin password for this ServerLab.">
      <SetupForm />
    </AuthenticationFrame>
  );
}
