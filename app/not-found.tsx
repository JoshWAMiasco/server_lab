import type { Metadata } from "next";
import { ButtonLink } from "@/components/primitives/button";

export const metadata: Metadata = { title: "Page Not Found" };

export default function NotFoundPage() {
  return (
    <main className="decoration-grid-backdrop flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="decoration-text-glow font-display text-7xl font-bold text-brand">404</div>
      <h1 className="mt-6 font-display text-xl font-medium text-foreground-strong">Page not found</h1>
      <p className="mt-3 max-w-md leading-relaxed text-foreground-muted">The page you are looking for does not exist or has been moved.</p>
      <ButtonLink href="/" variant="primary" className="mt-8 px-6">
        Back to the Lobby
      </ButtonLink>
    </main>
  );
}
