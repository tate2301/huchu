"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Badge, Button, Card, EmptyState, Skeleton, StatCard, Stack } from "@corelithzw/react";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CopyLink, ExternalLink, Plus } from "@corelithzw/ui/lib/icons";

type IntakeForm = {
  id: string;
  name: string;
  headline: string | null;
  publicToken: string;
  isActive: boolean;
  submissionCount: number;
  convertedCount: number;
  lastSubmissionAt: string | null;
};

type Submission = {
  id: string;
  status: string;
  createdAt: string;
  contactName: string | null;
  form: { id: string; name: string } | null;
  lead: { id: string; leadNo: string } | null;
};

function publicUrl(token: string): string {
  if (typeof window === "undefined") return `/f/${token}`;
  return `${window.location.origin}/f/${token}`;
}

/**
 * Intake forms.
 *
 * A form is a lead source, so the list is built around the numbers that make
 * it one: how many people have filled it in, how many of those became a real
 * lead, and when it last did anything. The previous version listed names and a
 * copy link, which cannot tell a form nobody has ever used from one bringing
 * work in every day.
 */
export function CrmFormsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const forms = useQuery({
    queryKey: ["crm-forms"],
    queryFn: () => fetchJson<{ data: IntakeForm[] }>("/api/v2/crm/intake-forms"),
  });

  const submissions = useQuery({
    queryKey: ["crm-submissions", "recent"],
    queryFn: () => fetchJson<{ data: Submission[] }>("/api/v2/crm/submissions?limit=8"),
  });

  const create = useMutation({
    mutationFn: () =>
      fetchJson<IntakeForm>("/api/v2/crm/intake-forms", {
        method: "POST",
        body: JSON.stringify({ name: "New intake form", fields: [], services: [] }),
      }),
    onSuccess: (form) => {
      queryClient.invalidateQueries({ queryKey: ["crm-forms"] });
      router.push(`/crm/forms/${form.id}`);
    },
    onError: (error) => toast({ title: getApiErrorMessage(error), variant: "destructive" }),
  });

  const rows = forms.data?.data ?? [];
  const totals = rows.reduce(
    (sum, form) => ({
      submissions: sum.submissions + form.submissionCount,
      converted: sum.converted + form.convertedCount,
      live: sum.live + (form.isActive ? 1 : 0),
    }),
    { submissions: 0, converted: 0, live: 0 },
  );

  const copyLink = async (form: IntakeForm) => {
    try {
      await navigator.clipboard.writeText(publicUrl(form.publicToken));
      setCopied(form.id);
      toast({ title: "Link copied", description: "Anyone with it can fill the form in." });
    } catch {
      toast({ title: "Couldn't copy the link", variant: "destructive" });
    }
  };

  if (forms.error) {
    return (
      <Alert tone="danger" title="Couldn't load the forms">
        {getApiErrorMessage(forms.error)}
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Live forms" value={totals.live} footer={`${rows.length} in total`} />
        <StatCard label="Submissions" value={totals.submissions} footer="All time" />
        <StatCard
          label="Became a lead"
          value={totals.converted}
          tone={totals.converted > 0 ? "success" : "neutral"}
          footer={
            totals.submissions > 0
              ? `${Math.round((totals.converted / totals.submissions) * 100)}% of submissions`
              : "Nothing submitted yet"
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-strong)]">Your forms</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Share the link anywhere — a submission lands in the CRM as a lead,
            assigned and scored on the way in.
          </p>
        </div>
        {/* Hidden while there is nothing here: the empty state below carries
            the same action in the same colour, and two brand-blue buttons
            offering one thing is the "one primary action per surface" rule
            broken on the screen where it matters most — the first one. */}
        {rows.length > 0 ? (
          <Button
            variant="primary"
            size="sm"
            startIcon={<Plus className="size-4" />}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            New form
          </Button>
        ) : null}
      </div>

      {forms.isLoading ? (
        <Skeleton height={180} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No intake forms yet"
          body="A form is the cheapest lead source you have — put one on the website and enquiries arrive already in the pipeline."
          action={
            <Button variant="primary" size="sm" onClick={() => create.mutate()}>
              Build the first form
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((form) => (
            <Card key={form.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/crm/forms/${form.id}`}
                    className="text-sm font-semibold hover:underline"
                  >
                    {form.name}
                  </Link>
                  {form.headline ? (
                    <p className="truncate text-sm text-[var(--text-muted)]">{form.headline}</p>
                  ) : null}
                </div>
                <Badge tone={form.isActive ? "success" : "neutral"} size="sm">
                  {form.isActive ? "Live" : "Paused"}
                </Badge>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-[var(--text-muted)]">Submissions</dt>
                  <dd className="font-mono">{form.submissionCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-[var(--text-muted)]">Became leads</dt>
                  <dd className="font-mono">{form.convertedCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-[var(--text-muted)]">Last one</dt>
                  <dd className="text-sm">
                    {form.lastSubmissionAt ? (
                      <ClientDate value={form.lastSubmissionAt} mode="date" />
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copyLink(form)}>
                  <CopyLink className="mr-1.5 size-4" />
                  {copied === form.id ? "Copied" : "Copy link"}
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/f/${form.publicToken}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 size-4" />
                    Preview
                  </a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => router.push(`/crm/forms/${form.id}`)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--text-strong)]">Latest submissions</h2>
        {submissions.isLoading ? (
          <Skeleton height={120} />
        ) : (submissions.data?.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nothing has been submitted yet.</p>
        ) : (
          <Stack as="ul" gap="xs">
            {(submissions.data?.data ?? []).map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{submission.contactName ?? "Someone"}</span>
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    via {submission.form?.name ?? "a form"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
                  <ClientDate value={submission.createdAt} mode="datetime" />
                  {submission.lead ? (
                    <Link href={`/crm/leads/${submission.lead.id}`} className="hover:underline">
                      {submission.lead.leadNo}
                    </Link>
                  ) : (
                    <Badge tone="warn" size="sm">
                      Not converted
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </Stack>
        )}
      </section>
    </div>
  );
}
