"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "@/lib/icons";

type PortalLoginFormProps = {
  portalTitle: string;
  portalDescription: string;
  portalIcon: React.ReactNode;
  companyLabel: string;
  redirectTo: string;
  helpText?: string;
};

function getAuthErrorMessage(rawError: string) {
  switch (rawError) {
    case "TENANT_HOST_REQUIRED":
      return "Use your organization URL to sign in.";
    case "TENANT_NOT_FOUND":
      return "This organization URL is not recognized.";
    case "TENANT_INACTIVE":
      return "This organization is currently inactive. Contact your administrator.";
    case "CredentialsSignin":
    case "Invalid credentials":
      return "Invalid email or password.";
    case "AUTH_EMAIL_NOT_FOUND":
      return "No account found for this email.";
    case "AUTH_PASSWORD_NOT_SET":
      return "This account has no password set. Contact your school administrator.";
    case "AUTH_PASSWORD_MISMATCH":
      return "Password does not match. Please try again.";
    default:
      return rawError;
  }
}

export function PortalLoginForm({
  portalTitle,
  portalDescription,
  portalIcon,
  companyLabel,
  redirectTo,
  helpText,
}: PortalLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(getAuthErrorMessage(result.error));
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {portalIcon}
          </div>
          <h1 className="text-2xl font-semibold">{companyLabel}</h1>
          <p className="text-sm text-muted-foreground">{portalTitle}</p>
        </div>

        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>{portalDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="portal-email">Email</Label>
                <Input
                  id="portal-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="portal-password">Password</Label>
                <Input
                  id="portal-password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t">
              <p className="text-xs text-center text-muted-foreground">
                {helpText ?? "Contact your administrator if you need access"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
