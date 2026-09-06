import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowRight, ShieldAlert, UserRound } from "@/lib/icons";

const RECOVERY_STEPS = [
  "Confirm you are signed in with the correct organization account.",
  "Ask your platform administrator to verify tenant and subscription status.",
  "Retry after access is restored.",
] as const;

export default function AccessBlockedPage() {
  return (
    <main
      className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-10"
      aria-labelledby="access-blocked-title"
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center justify-center">
        <Card className="relative w-full overflow-hidden border-border/80 bg-card shadow-sm">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--status-error-bg)] to-transparent"
            aria-hidden="true"
          />

          <CardHeader className="relative space-y-4 border-b border-border/80 pb-5 pt-6 sm:px-6 sm:pt-7">
            <Badge variant="destructive" className="w-fit">
              Access Restricted
            </Badge>

            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </div>

              <div className="space-y-2">
                <h1 id="access-blocked-title" className="text-page-title text-foreground">
                  Access blocked for this organization
                </h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Your signed-in account does not currently have permission to use this tenant host.
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 py-5 sm:px-6 sm:py-6">
            <section
              className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4"
              aria-labelledby="access-blocked-details"
            >
              <h2 id="access-blocked-details" className="text-sm font-semibold text-[var(--status-error-text)]">
                Why this happens
              </h2>
              <p className="mt-2 text-sm text-[var(--status-error-text)]">
                This usually means tenant access is temporarily restricted or your account belongs to a different organization.
              </p>
            </section>

            <section aria-labelledby="next-steps-title" className="space-y-3">
              <h2 id="next-steps-title" className="text-section-title text-foreground">
                What to do next
              </h2>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {RECOVERY_STEPS.map((step) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="sm:min-w-44">
                <Link href="/">
                  Retry Access
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="sm:min-w-44">
                <Link href="/login">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Switch Account
                </Link>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              If access still fails, contact your platform administrator with your company name and expected tenant.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
