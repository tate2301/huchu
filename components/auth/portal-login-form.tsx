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
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";
import { AlertCircle } from "@/lib/icons";

type PortalLoginFormProps = {
  portalTitle: string;
  portalDescription: string;
  portalIcon: React.ReactNode;
  companyLabel: string;
  redirectTo: string;
  helpText?: string;
  callbackUrl?: string;
  rememberMeEnabled?: boolean;
};

type AuthErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
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
    case "AUTH_RATE_LIMITED":
      return "Too many sign-in attempts. Please wait a few minutes and try again.";
    default:
      return rawError;
  }
}

async function getCredentialsPrecheckError(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/credentials-precheck", {
      method: "GET",
      cache: "no-store",
    });

    if (response.ok) {
      return null;
    }

    const payload = (await response.json()) as AuthErrorPayload;
    return payload.code || payload.error || payload.message || "An error occurred. Please try again.";
  } catch {
    return null;
  }
}

export function PortalLoginForm({
  portalTitle,
  portalDescription,
  portalIcon,
  companyLabel,
  redirectTo,
  helpText,
  callbackUrl,
  rememberMeEnabled = true,
}: PortalLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, redirectTo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const precheckError = await getCredentialsPrecheckError();
      if (precheckError) {
        setError(getAuthErrorMessage(precheckError));
        return;
      }

      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        rememberMe: rememberMe ? "true" : "false",
        callbackUrl: resolvedCallbackUrl,
        redirect: false,
      });

      if (result?.error) {
        setError(getAuthErrorMessage(result.error));
      } else {
        router.push(result?.url ?? resolvedCallbackUrl);
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

              {rememberMeEnabled ? (
                <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                    disabled={loading}
                  />
                  <span>Remember me on this device</span>
                </label>
              ) : null}

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
