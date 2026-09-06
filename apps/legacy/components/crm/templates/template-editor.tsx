"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Switch } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  BLOCKS_FOR_KIND,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
  templateProblems,
  type Block,
  type TemplateKind,
} from "@/lib/crm/blocks";
import { sampleValues, unknownVariables } from "@/lib/crm/template-variables";
import { CopyLink, Eye, Layers, ShieldCheck, Users } from "@corelithzw/ui/lib/icons";

import { AttributeHeader } from "./attribute-header";
import { BlockEditor } from "./block-editor";
import { BlockRenderer } from "./block-renderer";
import { TemplateAnalytics } from "./template-analytics";

type TemplateRecord = {
  id: string;
  name: string;
  kind: TemplateKind;
  attributes: { emoji?: string | null; description?: string | null; custom?: Record<string, string> } | null;
  blocks: Block[];
  isShared: boolean;
  isActive: boolean;
  linkedEntity: string | null;
  linkedRecordId: string | null;
  publicToken: string | null;
  viewCount: number;
  submitCount: number;
  lastViewedAt: string | null;
  lastSubmitAt: string | null;
  updatedAt: string;
  createdBy?: { id: string; name: string | null } | null;
  events?: Array<{ id: string; type: string; source: string | null; createdAt: string }>;
};

/**
 * A template, edited as the page it produces.
 *
 * The properties sit at the top the way Notion does them, the body is the
 * blocks, and the preview is the same renderer the customer will see. Nothing
 * here is a form that produces a document somewhere else — the thing on screen
 * is the thing.
 */
export function TemplateEditor({ templateId }: { templateId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isShared, setIsShared] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [view, setView] = useState<"edit" | "preview" | "activity">("edit");
  const preview = view === "preview";
  const [seededFor, setSeededFor] = useState<string | null>(null);

  const templateQuery = useQuery({
    queryKey: ["crm-template", templateId],
    queryFn: () => fetchJson<TemplateRecord>(`/api/v2/crm/templates/${templateId}`),
  });

  const loaded = templateQuery.data;
  if (loaded && loaded.id !== seededFor) {
    setSeededFor(loaded.id);
    setName(loaded.name);
    setEmoji(loaded.attributes?.emoji ?? null);
    setDescription(loaded.attributes?.description ?? "");
    setCustom(loaded.attributes?.custom ?? {});
    setBlocks(loaded.blocks ?? []);
    setIsShared(loaded.isShared);
    setIsActive(loaded.isActive);
  }

  const kind = loaded?.kind ?? "FORM";

  const problems = useMemo(() => templateProblems(kind, blocks), [kind, blocks]);
  const typos = useMemo(() => {
    const text = blocks
      .map((block) =>
        "text" in block && typeof block.text === "string" ? block.text : "",
      )
      .join("\n");
    return unknownVariables(text);
  }, [blocks]);

  const save = useMutation({
    mutationFn: () =>
      fetchJson<TemplateRecord>(`/api/v2/crm/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          attributes: { emoji, description, custom },
          blocks,
          isShared,
          isActive,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Template saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["crm-templates"] });
      queryClient.invalidateQueries({ queryKey: ["crm-template", templateId] });
    },
    onError: (error) =>
      toast({
        title: "Not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/crm/templates/${templateId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Template deleted" });
      router.push("/templates");
    },
    onError: (error) =>
      toast({
        title: "Could not delete it",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  if (templateQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (templateQuery.error || !loaded) {
    return (
      <Alert tone="danger" title="Template not found">
        {templateQuery.error
          ? getApiErrorMessage(templateQuery.error)
          : "It may have been deleted."}
      </Alert>
    );
  }

  const publicUrl = loaded.publicToken
    ? `${typeof window === "undefined" ? "" : window.location.origin}/f/${loaded.publicToken}`
    : null;

  return (
    <div className="space-y-5">
      <PageChrome
        title={name || "Untitled template"}
        backHref="/templates"
        backLabel="All templates"
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={view === "edit" ? "secondary" : "ghost"}
            onClick={() => setView("edit")}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant={view === "preview" ? "secondary" : "ghost"}
            onClick={() => setView("preview")}
          >
            <Eye className="mr-1.5 size-4" aria-hidden="true" />
            Preview
          </Button>
          <Button
            type="button"
            variant={view === "activity" ? "secondary" : "ghost"}
            onClick={() => setView("activity")}
          >
            Activity
          </Button>
          <Button
            type="button"
            disabled={save.isPending || problems.length > 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </PageChrome>

      {problems.length > 0 ? (
        <Alert tone="warn" title="Not ready to save">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {typos.length > 0 ? (
        <Alert tone="info" title="Variables nothing will fill">
          {/* Shown rather than blanked: a variable spelled slightly wrong reads
              as itself here and as an empty space in the customer's copy. */}
          <p>
            {typos.map((entry) => `{{${entry}}}`).join(", ")} — these will print as
            written. Pick from the variable list to be sure they resolve.
          </p>
        </Alert>
      ) : null}

      <AttributeHeader
        emoji={emoji}
        onEmojiChange={setEmoji}
        title={name}
        onTitleChange={setName}
        titlePlaceholder={`Untitled ${TEMPLATE_KIND_LABELS[kind].toLowerCase()}`}
        description={description}
        onDescriptionChange={setDescription}
        custom={custom}
        onCustomChange={setCustom}
        readOnly={preview}
        rows={[
          {
            id: "kind",
            label: "Kind",
            icon: Layers,
            display: (
              <span>
                {TEMPLATE_KIND_LABELS[kind]}
                <span className="text-[var(--text-muted)]">
                  {" · "}
                  {BLOCKS_FOR_KIND[kind].length} block types
                </span>
              </span>
            ),
          },
          {
            id: "shared",
            label: "Who can use it",
            icon: Users,
            display: (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={isShared}
                  disabled={preview}
                  onChange={(event) => setIsShared(event.target.checked)}
                  aria-label="Shared with the team"
                />
                {isShared ? "The whole team" : "Only me, for now"}
              </label>
            ),
          },
          {
            id: "active",
            label: "Status",
            icon: ShieldCheck,
            display: (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={isActive}
                  disabled={preview}
                  onChange={(event) => setIsActive(event.target.checked)}
                  aria-label="Active"
                />
                {isActive ? "In use" : "Retired"}
              </label>
            ),
          },
          ...(publicUrl
            ? [
                {
                  id: "link",
                  label: "Public link",
                  icon: CopyLink,
                  display: (
                    <button
                      type="button"
                      className="truncate text-left font-mono text-sm underline decoration-[var(--border)] underline-offset-2"
                      onClick={() => {
                        void navigator.clipboard?.writeText(publicUrl);
                        toast({ title: "Link copied" });
                      }}
                    >
                      {publicUrl}
                    </button>
                  ),
                },
              ]
            : []),
          {
            id: "activity",
            label: "Activity",
            display: (
              <span className="text-[var(--text-muted)]">
                {loaded.viewCount} view{loaded.viewCount === 1 ? "" : "s"} ·{" "}
                {loaded.submitCount} submission{loaded.submitCount === 1 ? "" : "s"}
                {loaded.lastSubmitAt ? (
                  <>
                    {" · last "}
                    <ClientDate value={loaded.lastSubmitAt} mode="datetime" />
                  </>
                ) : null}
              </span>
            ),
          },
        ]}
      />

      <hr className="border-[var(--border-subtle)]" />

      {view === "activity" ? (
        <TemplateAnalytics
          viewCount={loaded.viewCount}
          submitCount={loaded.submitCount}
          lastViewedAt={loaded.lastViewedAt}
          lastSubmitAt={loaded.lastSubmitAt}
          events={loaded.events ?? []}
        />
      ) : preview ? (
        <div className="rounded-[var(--card-radius)] border border-[var(--border)] p-6">
          <BlockRenderer
            blocks={blocks}
            context={{
              mode: "preview",
              // Sample values, so a preview shows the shape of a filled-in
              // document rather than a page of dashes.
              values: sampleValues(),
              currency: "USD",
            }}
          />
        </div>
      ) : (
        <BlockEditor kind={kind} blocks={blocks} onChange={setBlocks} />
      )}

      <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          Delete this template
        </Button>
      </div>
    </div>
  );
}

export const TEMPLATE_KIND_OPTIONS = TEMPLATE_KINDS.map((kind) => ({
  value: kind,
  label: TEMPLATE_KIND_LABELS[kind],
}));
