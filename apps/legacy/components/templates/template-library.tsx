"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Badge, EmptyState, IconTile, Stack } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { AttributeChips } from "@/components/crm/templates/attribute-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  TEMPLATE_KINDS,
  TEMPLATE_KIND_DESCRIPTIONS,
  TEMPLATE_KIND_LABELS,
  type TemplateKind,
} from "@/lib/crm/blocks";
import {
  starterBlocks,
  starterTemplate,
  startersForKind,
} from "@/lib/crm/starter-templates";
import { FileText, Plus } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * Every template in the company, in one place.
 *
 * A template is not a CRM thing. The quote layout, the site-survey form and
 * the invoice a customer receives are all "the shape of something we send" —
 * and they were in three places: the CRM's own library, the intake-form
 * builder, and Document Templates under Management. Somebody looking for
 * "our site visit form" had to already know which of the three it lived in.
 *
 * The three editors stay where they are, because they are genuinely different
 * tools: block templates are laid out visually, intake forms map to a lead,
 * and document templates carry a versioned schema. What moves is the front
 * door.
 */

type BlockTemplate = {
  id: string;
  name: string;
  kind: TemplateKind;
  attributes: {
    emoji?: string | null;
    description?: string | null;
    custom?: Record<string, string>;
  } | null;
  isShared: boolean;
  isActive: boolean;
  viewCount: number;
  submitCount: number;
  lastSubmitAt: string | null;
  updatedAt: string;
};

type IntakeForm = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  submissionCount: number;
  convertedCount: number;
  lastSubmissionAt: string | null;
};

type DocumentTemplate = {
  id: string;
  name: string;
  description: string | null;
  documentType: string;
  scope: "SYSTEM" | "COMPANY";
  isDefault: boolean;
  isActive: boolean;
  updatedAt: string;
};

type Entry = {
  id: string;
  name: string;
  href: string;
  emoji?: string | null;
  description: string | null;
  badges: Array<{ label: string; tone: "neutral" | "warn" | "success" }>;
  meta: React.ReactNode;
  custom?: Record<string, string>;
};

/** The bands the library is read in, in the order somebody reaches for them. */
const SECTIONS = [
  ...TEMPLATE_KINDS.map((kind) => ({
    id: kind,
    title: TEMPLATE_KIND_LABELS[kind],
    body: TEMPLATE_KIND_DESCRIPTIONS[kind],
  })),
  {
    id: "INTAKE",
    title: "Intake forms",
    body: "Public forms that create a lead when somebody fills one in.",
  },
  {
    id: "DOCUMENT",
    title: "Document layouts",
    body: "What a rendered PDF looks like — the versioned layouts behind exports.",
  },
];

export function TemplateLibrary() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<TemplateKind>("FORM");
  const [draftStarter, setDraftStarter] = useState<string | null>("site-brief");
  const [errors, setErrors] = useState<string[]>([]);

  const blocks = useQuery({
    queryKey: ["crm-templates"],
    queryFn: () => fetchJson<{ data: BlockTemplate[] }>("/api/v2/crm/templates"),
  });

  const intake = useQuery({
    queryKey: ["crm-intake-forms"],
    queryFn: () => fetchJson<{ data: IntakeForm[] }>("/api/v2/crm/intake-forms"),
  });

  const documents = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const response = await fetch("/api/document-templates");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load layouts");
      return payload as DocumentTemplate[];
    },
  });

  const starters = startersForKind(draftKind);
  const starter = draftStarter ? starterTemplate(draftStarter) : undefined;

  const create = useMutation({
    mutationFn: () =>
      fetchJson<{ id: string }>("/api/v2/crm/templates", {
        method: "POST",
        body: JSON.stringify({
          name: draftName.trim(),
          kind: draftKind,
          attributes: { custom: {}, emoji: starter?.emoji ?? null },
          // Starting from a finished document rather than a blank one. An
          // empty canvas is where people put the thing down and never come
          // back — and nobody should have to remember what an invoice needs
          // on it before they can write one.
          blocks: starter
            ? starterBlocks(starter, draftName)
            : [{ id: "title", type: "heading", text: draftName.trim(), level: 1 }],
        }),
      }),
    onSuccess: (created) => {
      setCreateOpen(false);
      setDraftName("");
      setDraftStarter(null);
      queryClient.invalidateQueries({ queryKey: ["crm-templates"] });
      router.push(`/templates/${created.id}`);
    },
    onError: (err) => setErrors([getApiErrorMessage(err)]),
  });

  const entriesFor = (sectionId: string): Entry[] => {
    if (sectionId === "INTAKE") {
      return (intake.data?.data ?? []).map((form) => ({
        id: form.id,
        name: form.name,
        href: `/crm/intake-forms/${form.id}`,
        emoji: "📥",
        description: form.description,
        badges: form.isActive ? [] : [{ label: "Retired", tone: "warn" as const }],
        meta: (
          <>
            {form.submissionCount} submission{form.submissionCount === 1 ? "" : "s"} ·{" "}
            {form.convertedCount} became leads
            {form.lastSubmissionAt ? (
              <>
                {" · last "}
                <ClientDate value={form.lastSubmissionAt} mode="date" />
              </>
            ) : null}
          </>
        ),
      }));
    }

    if (sectionId === "DOCUMENT") {
      return (documents.data ?? []).map((template) => ({
        id: template.id,
        name: template.name,
        href: "/preferences/organization/templates",
        emoji: "🖨️",
        description: template.description,
        badges: [
          ...(template.isDefault ? [{ label: "Default", tone: "success" as const }] : []),
          ...(template.scope === "SYSTEM"
            ? [{ label: "Built in", tone: "neutral" as const }]
            : []),
          ...(template.isActive ? [] : [{ label: "Retired", tone: "warn" as const }]),
        ],
        meta: (
          <>
            {template.documentType.toLowerCase().replace(/_/g, " ")} · updated{" "}
            <ClientDate value={template.updatedAt} mode="date" />
          </>
        ),
      }));
    }

    return (blocks.data?.data ?? [])
      .filter((template) => template.kind === sectionId)
      .map((template) => ({
        id: template.id,
        name: template.name,
        href: `/templates/${template.id}`,
        emoji: template.attributes?.emoji,
        description: template.attributes?.description ?? null,
        badges: [
          ...(template.isShared ? [] : [{ label: "Draft", tone: "neutral" as const }]),
          ...(template.isActive ? [] : [{ label: "Retired", tone: "warn" as const }]),
        ],
        custom: template.attributes?.custom ?? {},
        meta: (
          <>
            {template.viewCount} view{template.viewCount === 1 ? "" : "s"} ·{" "}
            {template.submitCount} sent
            {template.lastSubmitAt ? (
              <>
                {" · last "}
                <ClientDate value={template.lastSubmitAt} mode="date" />
              </>
            ) : null}
          </>
        ),
      }));
  };

  const sections = SECTIONS.map((section) => ({
    ...section,
    entries: entriesFor(section.id),
  })).filter((section) => section.entries.length > 0);

  const loading = blocks.isLoading || intake.isLoading || documents.isLoading;
  const failure = blocks.error ?? intake.error ?? documents.error;

  return (
    <div className="space-y-5">
      <PageChrome title="Templates" icon={FileText}>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          New template
        </Button>
      </PageChrome>

      {failure ? (
        <Alert tone="danger" title="Couldn't load every template">
          {getApiErrorMessage(failure)}
        </Alert>
      ) : null}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : sections.length === 0 ? (
        <EmptyState
          title="No templates yet"
          body="Forms, quotes, invoices, receipts and emails are all designed here, out of the same blocks."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              New template
            </Button>
          }
        />
      ) : (
        sections.map((section) => (
          <section key={section.id} className="space-y-1">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-strong)]">{section.title}</h2>
              <p className="text-sm text-[var(--text-muted)]">{section.body}</p>
            </div>

            <Stack as="ul" gap="xs">
              {section.entries.map((entry) => (
                <li
                  key={`${section.id}-${entry.id}`}
                  className="flex flex-col gap-2 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-subtle)] sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 gap-2.5">
                    <IconTile accentSeed={entry.name} size="sm">
                      {entry.emoji ?? "📄"}
                    </IconTile>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={entry.href}
                          className="text-sm font-medium underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
                        >
                          {entry.name}
                        </Link>
                        {entry.badges.map((badge) => (
                          <Badge key={badge.label} tone={badge.tone}>
                            {badge.label}
                          </Badge>
                        ))}
                      </div>

                      {entry.description ? (
                        <p className="text-sm text-[var(--text-muted)]">{entry.description}</p>
                      ) : null}

                      {entry.custom ? <AttributeChips custom={entry.custom} /> : null}
                    </div>
                  </div>

                  <p className="shrink-0 text-sm text-[var(--text-muted)]">{entry.meta}</p>
                </li>
              ))}
            </Stack>
          </section>
        ))
      )}

      <RecordDialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) setErrors([]);
        }}
        title="New template"
        description="Pick what it is for. The blocks on offer follow from that."
        size="md"
        errors={errors}
        onSubmit={(event) => {
          event.preventDefault();
          if (!draftName.trim()) {
            setErrors(["Give it a name."]);
            return;
          }
          setErrors([]);
          create.mutate();
        }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Site survey form"
          />
        </div>

        <div className="space-y-1.5">
          <Label>What is it for</Label>
          <Select
            value={draftKind}
            onValueChange={(value) => {
              const kind = value as TemplateKind;
              setDraftKind(kind);
              // Whatever was picked belongs to the old kind. Defaulting to the
              // first starter of the new one beats silently keeping a choice
              // that no longer exists.
              setDraftStarter(startersForKind(kind)[0]?.id ?? null);
            }}
          >
            <SelectTrigger aria-label="Template kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {TEMPLATE_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-[var(--text-muted)]">
            {TEMPLATE_KIND_DESCRIPTIONS[draftKind]}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Start from</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {starters.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={draftStarter === option.id}
                onClick={() => setDraftStarter(option.id)}
                className={cn(
                  "rounded-[var(--radius-md)] border p-2.5 text-left",
                  draftStarter === option.id
                    ? "border-[var(--interactive-primary)] bg-[var(--surface-hover)]"
                    : "border-[var(--border)] hover:border-[var(--interactive-primary)]",
                )}
              >
                <span className="block text-sm font-medium text-[var(--text-strong)]">
                  <span aria-hidden="true" className="mr-1.5">
                    {option.emoji}
                  </span>
                  {option.name}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                  {option.description}
                </span>
              </button>
            ))}

            <button
              type="button"
              aria-pressed={draftStarter === null}
              onClick={() => setDraftStarter(null)}
              className={cn(
                "rounded-[var(--radius-md)] border p-2.5 text-left",
                draftStarter === null
                  ? "border-[var(--interactive-primary)] bg-[var(--surface-hover)]"
                  : "border-dashed border-[var(--border)] hover:border-[var(--interactive-primary)]",
              )}
            >
              <span className="block text-sm font-medium text-[var(--text-strong)]">
                Blank
              </span>
              <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                Just a title. Build the rest yourself.
              </span>
            </button>
          </div>
        </div>
      </RecordDialog>
    </div>
  );
}
