"use client";

import * as React from "react";

import type { CrmIntakeFieldDef, CrmIntakeService } from "@/lib/crm/intake-schema";

type FormConfig = {
  name: string;
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  allowPhotos: boolean;
  maxPhotos: number;
  companyName: string;
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
          <Field label="Your name" required>
            <input
              className={inputClass}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
            />
          </Field>

          <Field label="Email">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>

          <Field label="Phone" required>
            <div className="flex gap-2">
              <select className={`${inputClass} w-32`} value={dialCode} onChange={(e) => setDialCode(e.target.value)}>
                {DIAL_CODES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="77 123 4567"
                required
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
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        active
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white text-neutral-700"
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
            <Field key={field.key} label={field.label} required={field.required} help={field.helpText}>
              <CustomField field={field} value={answers[field.key]} onChange={(v) => setAnswer(field.key, v)} />
            </Field>
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

          <Field label="Anything else?">
            <textarea className={inputClass} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[10px] bg-neutral-900 px-4 py-3 font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-[var(--radius-md)] border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none focus:border-neutral-900";

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
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-800">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {help ? <span className="mt-1 block text-sm text-neutral-500">{help}</span> : null}
    </label>
  );
}

function CustomField({
  field,
  value,
  onChange,
}: {
  field: CrmIntakeFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          className={inputClass}
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={inputClass}
          value={(value as number | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          required={field.required}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className={inputClass}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          required={field.required}
        />
      );
    case "select":
      return (
        <select
          className={inputClass}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          required={field.required}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case "multiselect":
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => {
            const selected = Array.isArray(value) && (value as string[]).includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  const arr = Array.isArray(value) ? (value as string[]) : [];
                  onChange(selected ? arr.filter((v) => v !== opt.value) : [...arr, opt.value]);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );
    case "text":
    default:
      return (
        <input
          className={inputClass}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
  }
}
