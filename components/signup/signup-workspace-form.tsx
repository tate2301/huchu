"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@corelithzw/react";

import { describeSignupRefusal } from "@/components/signup/signup-errors";
import {
  checkWorkspaceSlug,
  describeWorkspaceSlugProblem,
  suggestWorkspaceSlug,
} from "@/lib/signup/workspace-address";

type AddressState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "problem"; message: string; suggestion?: string | null };

/** What the server said about one address. Kept with the address it is about. */
type AddressAnswer = { slug: string; available: boolean; message?: string; suggestion?: string | null };

const CHECK_DELAY_MS = 350;

export function SignupWorkspaceForm({
  productSlug,
  defaultBusinessName,
  rootDomain,
}: {
  productSlug: string;
  defaultBusinessName: string;
  /** The domain workspaces live under, or null when there are no tenant hosts. */
  rootDomain: string | null;
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [slug, setSlug] = useState(suggestWorkspaceSlug(defaultBusinessName));
  const [slugEdited, setSlugEdited] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [answer, setAnswer] = useState<AddressAnswer | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // The address follows the name until the person edits the address itself.
  function onBusinessNameChange(value: string) {
    setBusinessName(value);
    if (!slugEdited) setSlug(suggestWorkspaceSlug(value));
  }

  // Rules the browser can check are checked while rendering; only whether the
  // address is free needs the server, and its answer is kept with the address
  // it was about, so a stale answer never describes a newer address.
  const localProblem = slug ? checkWorkspaceSlug(slug) : null;
  const address: AddressState = !slug
    ? { kind: "idle" }
    : localProblem
      ? { kind: "problem", message: describeWorkspaceSlugProblem(localProblem) }
      : answer?.slug !== slug
        ? { kind: "checking" }
        : answer.available
          ? { kind: "free" }
          : { kind: "problem", message: answer.message ?? "That address is taken.", suggestion: answer.suggestion };

  useEffect(() => {
    if (!slug || checkWorkspaceSlug(slug)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/signup/address?slug=${encodeURIComponent(slug)}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        setAnswer({ slug, available: Boolean(body.available), message: body.message, suggestion: body.suggestion });
      } catch {
        // Aborted by the next keystroke, or offline: the submit still checks.
      }
    }, CHECK_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [slug]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/signup/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, slug, whatsapp }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok && body.redirectUrl) {
        // Another host, so a full navigation rather than a client route.
        window.location.assign(body.redirectUrl);
        return;
      }
      if (body.reason === "NOT_VERIFIED") {
        router.push(`/signup/${productSlug}/verify`);
        return;
      }
      if (body.reason === "SLUG_TAKEN") {
        setAnswer({ slug, available: false, message: `${slug} is taken.`, suggestion: body.suggestion });
      } else if (body.reason === "INVALID_SLUG") {
        setAnswer({ slug, available: false, message: body.message });
      } else {
        setError(describeSignupRefusal(body.reason, body.retryAfterSeconds));
      }
      setCreating(false);
    } catch {
      setError(describeSignupRefusal(undefined));
      setCreating(false);
    }
  }

  const addressHint =
    address.kind === "free"
      ? `${slug}${rootDomain ? `.${rootDomain}` : ""} is free.`
      : address.kind === "checking"
        ? "Checking…"
        : "Your team signs in here.";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Input
        id="signup-business"
        label="Business name"
        autoComplete="organization"
        placeholder="Lux Liquor"
        value={businessName}
        onChange={(event) => onBusinessNameChange(event.target.value)}
        required
        disabled={creating}
      />
      <div className="flex flex-col gap-2">
        <Input
          id="signup-address"
          label="Workspace address"
          autoCapitalize="none"
          spellCheck={false}
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value.trim().toLowerCase());
          }}
          suffix={rootDomain ? `.${rootDomain}` : undefined}
          hint={address.kind === "problem" ? undefined : addressHint}
          error={address.kind === "problem" ? address.message : undefined}
          required
          disabled={creating}
        />
        {address.kind === "problem" && address.suggestion ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setSlugEdited(true);
              setSlug(address.suggestion ?? "");
            }}
          >
            Use {address.suggestion}
          </Button>
        ) : null}
      </div>
      <Input
        id="signup-whatsapp"
        label="WhatsApp number"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="077 123 4567"
        hint="Your setup link and renewal reminders go here."
        value={whatsapp}
        onChange={(event) => setWhatsapp(event.target.value)}
        required
        disabled={creating}
      />
      <Button type="submit" variant="primary" block loading={creating}>
        {creating ? "Setting up your workspace" : "Create workspace"}
      </Button>
    </form>
  );
}
