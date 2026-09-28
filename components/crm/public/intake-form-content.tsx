"use client";

import * as React from "react";

import { FieldInput } from "@/components/forms/field-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CrmIntakeFieldDef, CrmIntakeService } from "@/lib/crm/intake-schema";

type FormConfig = {
  name: string;
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  allowPhotos: boolean;
  maxPhotos: number;
  companyName: string;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  fields: CrmIntakeFieldDef[];
  services: CrmIntakeService[];
};

// A small country-code list keeps the phone unambiguous without a heavy dep.
const DIAL_CODES = [
  { code: "263", label: "🇿🇼 +263" },
  { code: "27", label: "🇿🇦 +27" },
  { code: "260", label: "🇿🇲 +260" },
  { code: "267", label: "🇧🇼 +267" },
  { code: "44", label: "🇬🇧 +44" },
  { code: "1", label: "🇺🇸 +1" },
];

function readUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "source"]) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

export function IntakeFormContent({ token }: { token: string }) {
  const [config, setConfig] = React.useState<FormConfig | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [contactName, setContactName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [dialCode, setDialCode] = React.useState("263");
  const [phone, setPhone] = React.useState("");
  const [selectedServices, setSelectedServices] = React.useState<string[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [message, setMessage] = React.useState("");
  const [photoUrls, setPhotoUrls] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetch(`/api/public/crm/intake/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.ok) {
          setLoadError(data.error ?? "This form is not available.");
        } else {
          setConfig(data.form as FormConfig);
        }
      })
      .catch(() => active && setLoadError("This form is not available."));
    return () => {
      active = false;
    };
  }, [token]);

  function setAnswer(key: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function toggleService(id: string) {
    setSelectedServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0 || !config) return;
    setUploading(true);
    try {
      const remaining = config.maxPhotos - photoUrls.length;
      for (const file of Array.from(files).slice(0, Math.max(0, remaining))) {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`/api/public/crm/intake/${token}/upload`, { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok && data.ok) setPhotoUrls((prev) => [...prev, data.url]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!config) return;
    if (!contactName.trim() || !phone.trim()) {
      setError(!contactName.trim() ? "Your name is needed" : "A phone number is needed");
      return;
    }
    setSubmitting(true);
    setError(null);
    const utm = readUtm();
    try {
      const res = await fetch(`/api/public/crm/intake/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName,
          email: email || undefined,
          phone: phone ? `${phone}` : undefined,
          phoneCountry: dialCode,
          selectedServices,
          answers,
          photoUrls,
          message: message || undefined,
          source: utm.source ?? "intake-form",
          utmSource: utm.utm_source,
          utmMedium: utm.utm_medium,
          utmCampaign: utm.utm_campaign,
          utmTerm: utm.utm_term,
          utmContent: utm.utm_content,
          referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
          landingPage: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Please check the form and try again.");
      } else {
        setDone(data.message ?? "Thank you.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <CenteredCard>{loadError}</CenteredCard>;
  }
  if (!config) {
    return <CenteredCard>Loading…</CenteredCard>;
  }
  if (done) {
    return (
      <CenteredCard>
        <h1 className="text-xl font-semibold text-neutral-900">{config.companyName}</h1>
        <p className="mt-3 text-neutral-600">{done}</p>
      </CenteredCard>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">{config.companyName}</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{config.headline ?? config.name}</h1>
        {config.description ? <p className="mt-2 text-neutral-600">{config.description}</p> : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <FieldInput
            field={{ key: "contact_name", label: "Your name", type: "text", required: true }}
            idPrefix="intake"
            value={contactName}
            onChange={(value) => setContactName(String(value ?? ""))}
          />

          <FieldInput
            field={{ key: "email", label: "Email", type: "email", required: false }}
            idPrefix="intake"
            value={email}
            onChange={(value) => setEmail(String(value ?? ""))}
          />

          <Field label="Phone" required htmlFor="intake-phone">
            <div className="flex gap-2">
              <Select value={dialCode} onValueChange={setDialCode}>
                <SelectTrigger className="w-32 shrink-0" aria-label="Country code">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIAL_CODES.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="intake-phone"
                type="tel"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="77 123 4567"
                aria-required
              />
            </div>
          </Field>

          {config.services.length > 0 ? (
            <Field label="What are you interested in?">
              <div className="flex flex-wrap gap-2">
                {config.services.map((service) => {
                  const active = selectedServices.includes(service.id);
                  return (
                    <button
                      type="button"
                      key={service.id}
                      onClick={() => toggleService(service.id)}
                      aria-pressed={active}
                      className={`h-[34px] rounded-full border px-3 text-sm ${
                        active
                          ? "border-[#16181D] bg-[#16181D] text-white"
                          : "border-[#D2D7E0] bg-white text-[#262A33]"
                      }`}
                    >
                      {service.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : null}

          {config.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              idPrefix="intake"
              value={answers[field.key]}
              onChange={(value) => setAnswer(field.key, value)}
              uploadUrl={`/api/public/crm/intake/${token}/upload?question=${encodeURIComponent(field.key)}`}
            />
          ))}

          {config.allowPhotos ? (
            <Field label={`Photos (optional, up to ${config.maxPhotos})`}>
              <input type="file" accept="image/*" multiple onChange={(e) => handleUpload(e.target.files)} />
              {uploading ? <p className="mt-1 text-sm text-neutral-500">Uploading…</p> : null}
              {photoUrls.length > 0 ? (
                <p className="mt-1 text-sm text-neutral-500">{photoUrls.length} photo(s) attached</p>
              ) : null}
            </Field>
          ) : null}

          <FieldInput
            field={{ key: "message", label: "Anything else?", type: "longText", required: false }}
            idPrefix="intake"
            value={message}
            onChange={(value) => setMessage(String(value ?? ""))}
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="h-[46px] w-full rounded-[10px] bg-[#16181D] px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>

          <PolicyLinks config={config} />
        </form>
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  /** The control the label names; without one the label wraps its control. */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className="grid gap-[7px]">
      <Label htmlFor={htmlFor} className="text-[15px] font-semibold leading-[1.35] text-[#16181D]">
        {label}
        {required ? <span className="text-[#B83A2A]" aria-hidden="true"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function PolicyLinks({ config }: { config: FormConfig }) {
  const links = [
    config.privacyPolicyUrl ? { href: config.privacyPolicyUrl, label: "Privacy Policy" } : null,
    config.termsUrl ? { href: config.termsUrl, label: "Terms and Conditions" } : null,
  ].filter((link): link is { href: string; label: string } => link !== null);

  if (links.length === 0) return null;

  return (
    <p className="text-center text-sm leading-relaxed text-neutral-500">
      By submitting this form you agree to how {config.companyName} handles your
      information. See our{" "}
      {links.map((link, index) => (
        <React.Fragment key={link.href}>
          {index > 0 ? " and " : null}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-neutral-900"
          >
            {link.label}
          </a>
        </React.Fragment>
      ))}
      .
    </p>
  );
}
