"use client";

import * as React from "react";

import { AlertCircle, ArrowRight, Calendar, CheckCircle2, Loader2, Send } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { demoHighlights } from "@/components/marketing/marketing-data";

type DemoBookingFormProps = {
  schedulerHref: string;
  schedulerExternal: boolean;
  title?: string;
  description?: string;
  source?: string;
  className?: string;
};

type DemoFormState = {
  name: string;
  email: string;
  company: string;
  industry: string;
  teamSize: string;
  message: string;
  website: string;
};

const INITIAL_STATE: DemoFormState = {
  name: "",
  email: "",
  company: "",
  industry: "gold",
  teamSize: "11-50",
  message: "",
  website: "",
};

export function DemoBookingForm({
  schedulerHref,
  schedulerExternal,
  title = "See the workflow your team needs next.",
  description = "Share your rollout shape and we will tailor the walkthrough.",
  source = "marketing-site",
  className,
}: DemoBookingFormProps) {
  const [form, setForm] = React.useState(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = React.useState<string | null>(null);
  const [resolvedSchedulerHref, setResolvedSchedulerHref] = React.useState(schedulerHref);
  const [resolvedSchedulerExternal, setResolvedSchedulerExternal] = React.useState(schedulerExternal);

  const handleChange =
    (field: keyof DemoFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          source,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        scheduleUrl?: string | null;
        submittedAt?: string;
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "We could not submit your demo request. Please try again.");
        return;
      }

      if (payload.scheduleUrl && payload.scheduleUrl.length > 0) {
        setResolvedSchedulerHref(payload.scheduleUrl);
        setResolvedSchedulerExternal(
          /^(https?:)?\/\//i.test(payload.scheduleUrl) ||
            payload.scheduleUrl.startsWith("mailto:") ||
            payload.scheduleUrl.startsWith("tel:"),
        );
      }

      setSubmittedAt(payload.submittedAt ?? new Date().toISOString());
      setForm(INITIAL_STATE);
    } catch {
      setError("We could not submit your demo request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div id="demo-form" className={cn("grid gap-10 lg:grid-cols-[0.82fr_1.18fr]", className)}>
      <div className="space-y-6 text-white">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/62">Book a demo</p>
          <h3 className="mt-3 text-[clamp(1.9rem,3.2vw,2.9rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-balance">
            {title}
          </h3>
          <p className="mt-3 text-sm leading-7 text-white/74">{description}</p>
        </div>

        <div className="grid gap-3 border-y border-white/10 py-5 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/44">Format</p>
            <p className="mt-2 text-sm leading-6 text-white/78">Live walkthrough.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/44">Focus</p>
            <p className="mt-2 text-sm leading-6 text-white/78">Packs, controls, and fit.</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/44">Outcome</p>
            <p className="mt-2 text-sm leading-6 text-white/78">A clear rollout path.</p>
          </div>
        </div>

        <div className="space-y-4">
          {demoHighlights.map((item, index) => (
            <div key={item} className="flex gap-3 text-sm leading-6 text-white/78">
              <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-white/38">0{index + 1}</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <Button asChild size="lg" className="rounded-full">
          <a
            href={resolvedSchedulerHref}
            target={resolvedSchedulerExternal ? "_blank" : undefined}
            rel={resolvedSchedulerExternal ? "noreferrer" : undefined}
          >
            Schedule
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>

      <div className="space-y-6 border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:border-white/10 lg:pl-10 lg:pt-0">
        {submittedAt ? (
          <div className="space-y-4 border-b border-white/10 pb-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-white">Demo request received.</p>
                <p className="mt-1 text-sm leading-6 text-white/72">
                  We have your details. You can lock time now, and we will shape the session around your rollout.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <a
                  href={resolvedSchedulerHref}
                  target={resolvedSchedulerExternal ? "_blank" : undefined}
                  rel={resolvedSchedulerExternal ? "noreferrer" : undefined}
                >
                  Schedule
                  <Calendar className="size-4" />
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="rounded-full border-white/18 bg-white/6 text-white hover:bg-white/12 hover:text-white"
                onClick={() => setSubmittedAt(null)}
              >
                Submit another request
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 border-b border-white/10 pb-4 text-red-100">
            <AlertCircle className="mt-0.5 size-5 text-red-300" />
            <p className="text-sm leading-6">{error}</p>
          </div>
        ) : null}

        {!submittedAt ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" htmlFor="demo-name" required>
                <input
                  id="demo-name"
                  autoComplete="name"
                  value={form.name}
                  onChange={handleChange("name")}
                  placeholder="Chris Moyo"
                  required
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </Field>

              <Field label="Work email" htmlFor="demo-email" required>
                <input
                  id="demo-email"
                  autoComplete="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="you@company.com"
                  required
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </Field>

              <Field label="Company" htmlFor="demo-company" required>
                <input
                  id="demo-company"
                  autoComplete="organization"
                  value={form.company}
                  onChange={handleChange("company")}
                  placeholder="Pagka Operations"
                  required
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </Field>

              <Field label="Industry" htmlFor="demo-industry" required>
                <select
                  id="demo-industry"
                  value={form.industry}
                  onChange={handleChange("industry")}
                  disabled={isSubmitting}
                  className={inputClass}
                >
                  <option value="gold">Gold operations</option>
                  <option value="schools">School operations</option>
                  <option value="retail">Retail / POS</option>
                  <option value="autos">Auto sales</option>
                  <option value="scrap">Scrap & recycling</option>
                  <option value="multi-site">Multi-site operations</option>
                </select>
              </Field>

              <Field label="Team size" htmlFor="demo-team-size" required>
                <select
                  id="demo-team-size"
                  value={form.teamSize}
                  onChange={handleChange("teamSize")}
                  disabled={isSubmitting}
                  className={inputClass}
                >
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-150">51-150</option>
                  <option value="151-500">151-500</option>
                  <option value="500+">500+</option>
                </select>
              </Field>

              <Field label="Website" htmlFor="demo-website" className="hidden" required={false}>
                <input
                  id="demo-website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={handleChange("website")}
                  placeholder="Leave blank"
                  disabled={isSubmitting}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="What should we show in the demo?"
              htmlFor="demo-message"
              hint="Examples: site structure, approvals, settlement flows, or the tool you want to replace."
              required
            >
              <textarea
                id="demo-message"
                value={form.message}
                onChange={handleChange("message")}
                placeholder="Show us the controls, handoffs, and reporting you want to see."
                className={`${inputClass} min-h-28 resize-y pt-3`}
                required
                disabled={isSubmitting}
              />
            </Field>

            <div className="flex flex-col gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-white/74">
                Tailored to your operating model, not a generic tour.
              </p>
              <Button type="submit" size="lg" className="rounded-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  <>
                    Send
                    <Send className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

const inputClass =
  "h-11 w-full border-0 border-b border-white/18 bg-transparent px-0 text-sm text-white outline-none transition-colors duration-150 placeholder:text-white/48 focus:border-white disabled:cursor-not-allowed disabled:opacity-60";

function Field({
  label,
  htmlFor,
  hint,
  required = false,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/62">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
      {hint ? <p className="text-xs leading-5 text-white/54">{hint}</p> : null}
    </div>
  );
}
