"use client";

import { FormEvent, useMemo, useState } from "react";

import { ArrowRight, ExternalLink, Loader2 } from "@corelithzw/ui/lib/icons";
import {
  contactChannels,
  getSegmentByAnySlug,
  segments,
} from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";

type FormState = {
  name: string;
  email: string;
  company: string;
  phone: string;
  city: string;
  industry: string;
  teamSize: string;
  locations: string;
  currentTools: string;
  problemArea: string;
  timeline: string;
  preferredChannel: string;
  message: string;
  website: string;
};

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; submittedAt: string; scheduleUrl: string | null }
  | { status: "error"; message: string };

/**
 * Schools are not a segment, but they still arrive here from their own page via
 * `?interest=schools`, so the picker carries them as a sixth option.
 */
const BUSINESS_TYPES: Array<{ value: string; label: string }> = [
  ...segments.map((segment) => ({ value: segment.slug, label: segment.title })),
  { value: "schools", label: "School" },
];

const initialState: FormState = {
  name: "",
  email: "",
  company: "",
  phone: "",
  city: "",
  industry: BUSINESS_TYPES[0].value,
  teamSize: "",
  locations: "",
  currentTools: "",
  problemArea: "",
  timeline: "",
  preferredChannel: "WhatsApp",
  message: "",
  website: "",
};

function resolveBusinessType(interest: string | undefined): string | null {
  if (!interest) return null;
  if (interest === "schools") return "schools";
  return getSegmentByAnySlug(interest)?.slug ?? null;
}

function businessTypeLabel(value: string): string {
  return BUSINESS_TYPES.find((type) => type.value === value)?.label ?? BUSINESS_TYPES[0].label;
}

function fieldId(name: keyof FormState) {
  return `demo-${name}`;
}

export function DemoRequestForm({ initialInterest }: { initialInterest?: string }) {
  const [form, setForm] = useState<FormState>({
    ...initialState,
    industry: resolveBusinessType(initialInterest) ?? initialState.industry,
  });
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const selectedLabel = businessTypeLabel(form.industry);
  const whatsappHref = useMemo(() => {
    const lines = [
      "Hi Corelith, I would like help finding the right setup.",
      form.company ? `Business: ${form.company}` : "",
      `Interest: ${selectedLabel}`,
      form.city ? `City: ${form.city}` : "",
      form.problemArea ? `Problem: ${form.problemArea}` : "",
    ].filter(Boolean);

    return `https://wa.me/263784939111?text=${encodeURIComponent(lines.join("\n"))}`;
  }, [form.city, form.company, form.problemArea, selectedLabel]);

  function updateField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: "submitting" });

    try {
      const response = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          industry: selectedLabel,
          interest: form.industry,
          source: "book-demo",
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        submittedAt?: string;
        scheduleUrl?: string | null;
      };

      if (!response.ok || !body.ok || !body.submittedAt) {
        setSubmitState({
          status: "error",
          message: body.error ?? "We could not submit the demo request. Please try again.",
        });
        return;
      }

      setSubmitState({
        status: "success",
        submittedAt: body.submittedAt,
        scheduleUrl: body.scheduleUrl ?? null,
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "We could not reach the demo request service. Continue on WhatsApp or try again.",
      });
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} id="demo-form">
      {submitState.status === "success" ? (
        <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
          <strong>Demo request received</strong>
          <span>
            We have the setup details. Continue on WhatsApp for fastest follow-up, or use the scheduler if it is configured.
          </span>
          <div className={styles.buttonRow}>
            <a href={whatsappHref} className={`${styles.button} ${styles.buttonPrimary}`} target="_blank" rel="noreferrer">
              Continue on WhatsApp
              <ExternalLink className={styles.icon} weight="regular" />
            </a>
            {submitState.scheduleUrl ? (
              <a href={submitState.scheduleUrl} className={styles.button} target="_blank" rel="noreferrer">
                Open scheduler
                <ExternalLink className={styles.icon} weight="regular" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {submitState.status === "error" ? (
        <div className={`${styles.alert} ${styles.alertError}`} role="alert">
          <strong>Demo request not sent</strong>
          <span>{submitState.message}</span>
        </div>
      ) : null}

      <div className={styles.hiddenField} aria-hidden="true">
        <label htmlFor={fieldId("website")}>Website</label>
        <input
          id={fieldId("website")}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => updateField("website", event.target.value)}
        />
      </div>

      <div className={styles.formGrid}>
        <Field label="Contact person" name="name" value={form.name} onChange={updateField} required />
        <Field label="Work email" name="email" type="email" value={form.email} onChange={updateField} required />
        <Field label="Business name" name="company" value={form.company} onChange={updateField} required />
        <Field label="Phone" name="phone" type="tel" value={form.phone} onChange={updateField} />
        <Field label="City" name="city" value={form.city} onChange={updateField} />
        <div className={styles.field}>
          <label htmlFor={fieldId("industry")}>Business type</label>
          <select
            id={fieldId("industry")}
            value={form.industry}
            onChange={(event) => updateField("industry", event.target.value)}
            className={styles.select}
            required
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="People using the system" name="teamSize" value={form.teamSize} onChange={updateField} required />
        <Field label="Locations" name="locations" value={form.locations} onChange={updateField} />
        <Field label="Current tools" name="currentTools" value={form.currentTools} onChange={updateField} />
        <Field label="Timeline" name="timeline" value={form.timeline} onChange={updateField} />
        <div className={styles.field}>
          <label htmlFor={fieldId("preferredChannel")}>Preferred channel</label>
          <select
            id={fieldId("preferredChannel")}
            value={form.preferredChannel}
            onChange={(event) => updateField("preferredChannel", event.target.value)}
            className={styles.select}
          >
            <option>WhatsApp</option>
            <option>Email</option>
            <option>Phone call</option>
            <option>Calendar demo</option>
          </select>
        </div>
        <Field label="Problem area" name="problemArea" value={form.problemArea} onChange={updateField} />
      </div>

      <div className={styles.field}>
        <label htmlFor={fieldId("message")}>Biggest operational problem</label>
        <textarea
          id={fieldId("message")}
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          className={styles.textarea}
          required
          minLength={10}
        />
      </div>

      <div className={styles.formFooter}>
        <button
          type="submit"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={submitState.status === "submitting"}
        >
          {submitState.status === "submitting" ? (
            <Loader2 className={styles.spinnerIcon} weight="regular" />
          ) : (
            <ArrowRight className={styles.icon} weight="regular" />
          )}
          Request tailored demo
        </button>
        <a href={whatsappHref} className={styles.button} target="_blank" rel="noreferrer">
          Continue on WhatsApp
          <ExternalLink className={styles.icon} weight="regular" />
        </a>
        <p className={styles.small}>
          The request uses the existing Corelith marketing endpoint. No payment or account is created here.
        </p>
      </div>

      <div className={styles.channelStrip}>
        {contactChannels.map((channel) => (
          <span key={channel.title}>{channel.title}</span>
        ))}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
  onChange,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  type?: string;
  required?: boolean;
  onChange: (name: keyof FormState, value: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId(name)}>{label}</label>
      <input
        id={fieldId(name)}
        type={type}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        className={styles.input}
        required={required}
      />
    </div>
  );
}
