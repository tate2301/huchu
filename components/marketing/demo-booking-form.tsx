"use client";

import * as React from "react";

import { AlertCircle, ArrowRight, Calendar, CheckCircle2, Loader2, Send } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type DemoBookingFormProps = {
  schedulerHref: string;
  schedulerExternal: boolean;
  title?: string;
  description?: string;
  source?: string;
  compact?: boolean;
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
  title = "Book a working session with the Huchu team",
  description = "Tell us your operating model, the workflows you want to replace, and the packs you want to evaluate.",
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
    <Card
      id="demo-form"
      className={cn(
        "rounded-[28px] border-white/60 bg-white/85 shadow-[0_28px_90px_rgba(24,32,48,0.12)] backdrop-blur",
        className,
      )}
    >
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--edge-default)] bg-[var(--surface-subtle)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <Calendar className="size-4" />
          Book a demo
        </div>
        <CardTitle className="text-2xl md:text-[2rem]">{title}</CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {submittedAt ? (
          <div className="flex flex-col gap-4 rounded-[24px] border border-emerald-200 bg-emerald-50/90 p-5 text-emerald-950">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">Demo request received.</p>
                <p className="text-sm leading-6 text-emerald-900/80">
                  We captured your request and you can move straight into scheduling if you want to lock time now.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <a
                  href={resolvedSchedulerHref}
                  target={resolvedSchedulerExternal ? "_blank" : undefined}
                  rel={resolvedSchedulerExternal ? "noreferrer" : undefined}
                >
                  Schedule instantly
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={() => setSubmittedAt(null)}>
                Submit another request
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-[20px] border border-red-200 bg-red-50/90 p-4 text-red-900">
            <AlertCircle className="mt-0.5 size-5 text-red-700" />
            <p className="text-sm leading-6">{error}</p>
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" htmlFor="demo-name" required>
              <Input
                id="demo-name"
                autoComplete="name"
                value={form.name}
                onChange={handleChange("name")}
                placeholder="Chris Moyo"
                required
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Work email" htmlFor="demo-email" required>
              <Input
                id="demo-email"
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={handleChange("email")}
                placeholder="you@company.com"
                required
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Company" htmlFor="demo-company" required>
              <Input
                id="demo-company"
                autoComplete="organization"
                value={form.company}
                onChange={handleChange("company")}
                placeholder="Pagka Operations"
                required
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Industry" htmlFor="demo-industry" required>
              <select
                id="demo-industry"
                value={form.industry}
                onChange={handleChange("industry")}
                disabled={isSubmitting}
                className="flex h-9 w-full min-w-0 rounded-[8px] border border-[var(--edge-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm shadow-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] outline-none hover:border-[var(--edge-strong)] hover:bg-[var(--surface-subtle)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]"
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
                className="flex h-9 w-full min-w-0 rounded-[8px] border border-[var(--edge-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm shadow-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] outline-none hover:border-[var(--edge-strong)] hover:bg-[var(--surface-subtle)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]"
              >
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-150">51-150</option>
                <option value="151-500">151-500</option>
                <option value="500+">500+</option>
              </select>
            </Field>
            <Field label="Website" htmlFor="demo-website" className="hidden" required={false}>
              <Input
                id="demo-website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={handleChange("website")}
                placeholder="Leave blank"
                disabled={isSubmitting}
              />
            </Field>
          </div>

          <Field
            label="What should we show in the demo?"
            htmlFor="demo-message"
            hint="Tell us your workflows, sites, reporting needs, or the systems you are replacing."
            required
          >
            <Textarea
              id="demo-message"
              value={form.message}
              onChange={handleChange("message")}
              placeholder="We want to see gold chain-of-custody, payroll-linked settlement flows, and reporting across multiple sites."
              className="min-h-32 rounded-[16px] border border-[var(--edge-default)] bg-[var(--surface-panel)] shadow-none hover:border-[var(--edge-strong)]"
              required
              disabled={isSubmitting}
            />
          </Field>

          <div className="flex flex-col gap-3 border-t border-[var(--edge-default)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              We tailor each session around the packs, workflows, controls, and reporting surfaces that matter most to your team.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="outline" size="lg" asChild>
                <a
                  href={resolvedSchedulerHref}
                  target={resolvedSchedulerExternal ? "_blank" : undefined}
                  rel={resolvedSchedulerExternal ? "noreferrer" : undefined}
                >
                  Schedule instantly
                  <Calendar className="size-4" />
                </a>
              </Button>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  <>
                    Send request
                    <Send className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

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
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
