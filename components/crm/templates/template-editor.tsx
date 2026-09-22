"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Switch } from "@corelithzw/react";
import { ActivityTrail, type ActivityEvent } from "@/components/management/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientDate } from "@/components/ui/client-date";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  BLOCKS_FOR_KIND,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
  templateProblems,
  type Block,
  type TemplateKind,
} from "@/lib/crm/blocks";
import { sampleValues, unknownVariables } from "@/lib/crm/template-variables";
import { ArrowLeft, Check, DotsThree, Eye, Info, Pencil } from "@/lib/icons";

import { BlockEditor } from "./block-editor";
import { BlockRenderer } from "./block-renderer";
import { TemplateAnalytics } from "./template-analytics";
import styles from "./builder.module.css";

type TemplateRecord = {
  id: string;
  name: string;
  kind: TemplateKind;
  attributes: {
    emoji?: string | null;
    description?: string | null;
    custom?: Record<string, string>;
  } | null;
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
 * A template, edited as the page it produces — `TemplateBuilder.dc.html`.
 *
 * One 60px header over three columns: the blocks you can add, the page you are
 * building, and the settings of whatever is selected on it. The preview is the
 * same `BlockRenderer` the customer will meet, because a builder whose preview
 * is a different component from its output is a builder that lies, and the lie
 * is only discovered by a customer.
 *
 * Presentation only: every query key, endpoint and mutation below is the one
 * that was here before.
 */
export function TemplateEditor({ templateId }: { templateId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [isShared, setIsShared] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [view, setView] = useState<"edit" | "preview" | "activity">("edit");
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
      .map((block) => ("text" in block && typeof block.text === "string" ? block.text : ""))
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
    mutationFn: () => fetchJson(`/api/v2/crm/templates/${templateId}`, { method: "DELETE" }),
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
        <Skeleton className="h-15 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (templateQuery.error || !loaded) {
    return (
      <p className={styles.empty}>
        {templateQuery.error
          ? getApiErrorMessage(templateQuery.error)
          : "That template is gone."}
      </p>
    );
  }

  const publicUrl = loaded.publicToken
    ? `${typeof window === "undefined" ? "" : window.location.origin}/f/${loaded.publicToken}`
    : null;

  /**
   * The record's own events, as the shared trail reads them.
   *
   * These are `CrmTemplateEvent` rows, not `PlatformAuditEvent` — the CRM
   * template API carries its own event list and there is no audit route for
   * this record. They are mapped rather than invented, and no chain claim is
   * made: `chainVerified` is left undefined because nothing here walked a
   * `prevEventHash`.
   */
  const events: ActivityEvent[] = (loaded.events ?? []).map((event) => ({
    id: event.id,
    eventType: `TEMPLATE.${event.type.toUpperCase()}`,
    createdAt: event.createdAt,
    summary: event.type === "VIEW" ? "Opened" : event.type === "SUBMIT" ? "Filled in" : event.type,
    actor: event.source,
  }));

  return (
    <div className={styles.shell}>
      <header className={styles.head}>
        <button
          type="button"
          aria-label="Back to templates"
          className={styles.iconBtn}
          onClick={() => router.push("/templates")}
        >
          <ArrowLeft aria-hidden="true" />
        </button>

        <span className={styles.titleGroup}>
          {renaming ? (
            <input
              autoFocus
              aria-label="Name"
              className={styles.titleInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setRenaming(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setRenaming(false);
                if (event.key === "Escape") {
                  setName(loaded.name);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <>
              {/* Rule 8: clicking either the title or the pencil opens it. */}
              <h1 className={styles.title}>
                <button
                  type="button"
                  className={styles.titleButton}
                  onClick={() => setRenaming(true)}
                >
                  {name || `Untitled ${TEMPLATE_KIND_LABELS[kind].toLowerCase()}`}
                </button>
              </h1>
              <button
                type="button"
                aria-label="Rename the template"
                className={styles.pencil}
                onClick={() => setRenaming(true)}
              >
                <Pencil aria-hidden="true" />
              </button>
            </>
          )}
        </span>

        {/* Rule 5: the chip marks the exception. A template the team can
            already use draws nothing. */}
        {!isShared ? <span className={styles.draft}>Draft</span> : null}
        {!isActive ? <span className={styles.retired}>Retired</span> : null}

        <span className={styles.spacer} />

        {/* One control, labelled with what it will do next — which is what
            `TemplateRender.dc.html` draws beside the rendered document. */}
        <button
          type="button"
          className={styles.btn}
          aria-pressed={view === "preview"}
          onClick={() => setView(view === "preview" ? "edit" : "preview")}
        >
          {view === "preview" ? (
            <Pencil aria-hidden="true" />
          ) : (
            <Eye aria-hidden="true" />
          )}
          {view === "preview" ? "Edit blocks" : "Preview"}
        </button>

        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={save.isPending || problems.length > 0}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Publish"}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More actions" className={styles.iconBtn}>
              <DotsThree aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setView(view === "activity" ? "edit" : "activity")}>
              {view === "activity" ? "Back to the blocks" : "Activity"}
            </DropdownMenuItem>
            {publicUrl ? (
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard?.writeText(publicUrl);
                  toast({ title: "Link copied" });
                }}
              >
                Copy the public link
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={remove.isPending} onSelect={() => remove.mutate()}>
              Delete this template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {view === "preview" ? (
        <div className={styles.previewBody}>
          <div className={styles.previewStage}>
            <div className={styles.previewPage}>
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
          </div>

          <aside className={styles.aside}>
            <div className={styles.asideHead}>
              <span
                className={styles.asideTile}
                data-tone={isShared ? undefined : "draft"}
                aria-hidden="true"
              >
                {isShared ? <Check /> : <Pencil />}
              </span>
              {/* The state is the heading, so nothing below repeats it — and
                  it is the past tense of the header's verb, so the two read
                  as one thing. "In use" is kept for `isActive`, which is a
                  different fact and gets its own row. */}
              <h2 className={styles.asideTitle}>{isShared ? "Published" : "Draft"}</h2>
            </div>

            <dl className={styles.facts}>
              <dt>Used for</dt>
              <dd>{TEMPLATE_KIND_LABELS[kind]}</dd>

              <dt>Blocks</dt>
              <dd className={styles.factMono}>{blocks.length}</dd>

              <dt>Built by</dt>
              <dd>{loaded.createdBy?.name ?? "—"}</dd>

              <dt>Last saved</dt>
              <dd>
                <ClientDate value={loaded.updatedAt} mode="date" />
              </dd>

              {publicUrl ? (
                <>
                  <dt>Public link</dt>
                  <dd className={styles.factMono}>{publicUrl}</dd>
                </>
              ) : null}
            </dl>

            <p className={styles.note}>
              <Info aria-hidden="true" />
              <span>
                Colours and the logo come from Branding. Changing them there changes
                every document.
              </span>
            </p>
          </aside>
        </div>
      ) : view === "activity" ? (
        <div className={styles.canvas}>
          <div className={styles.sheet}>
            <TemplateAnalytics
              viewCount={loaded.viewCount}
              submitCount={loaded.submitCount}
              lastViewedAt={loaded.lastViewedAt}
              lastSubmitAt={loaded.lastSubmitAt}
            />
            <ActivityTrail
              events={events}
              emptyLabel="Nothing recorded against this template yet"
            />
          </div>
        </div>
      ) : (
        <BlockEditor
          kind={kind}
          blocks={blocks}
          onChange={setBlocks}
          banner={
            problems.length > 0 || typos.length > 0 ? (
              <ul className={styles.problems}>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
                {typos.length > 0 ? (
                  <li>
                    {`${typos.map((entry) => `{{${entry}}}`).join(", ")} — nothing fills these`}
                  </li>
                ) : null}
              </ul>
            ) : null
          }
          properties={
            <>
              {/* Rule 4: the kind is a fact about the record, not a chip on
                  its title — so it is stated once, here, where the rest of
                  the record's properties are. */}
              <div className={styles.field}>
                <span className={styles.propLabel}>Used for</span>
                <span className={styles.propValue}>
                  {`${TEMPLATE_KIND_LABELS[kind]} · ${BLOCKS_FOR_KIND[kind].length} blocks`}
                </span>
              </div>

              <div className={styles.switchRow}>
                <span className={styles.switchLabel}>The whole team can use it</span>
                <Switch
                  checked={isShared}
                  onChange={(event) => setIsShared(event.target.checked)}
                  aria-label="The whole team can use it"
                />
              </div>

              <div className={styles.switchRow}>
                <span className={styles.switchLabel}>In use</span>
                <Switch
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  aria-label="In use"
                />
              </div>

              {publicUrl ? (
                <>
                  <h3 className={styles.group}>Public link</h3>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.linkBtn}`}
                    onClick={() => {
                      void navigator.clipboard?.writeText(publicUrl);
                      toast({ title: "Link copied" });
                    }}
                  >
                    <span className={styles.linkBtnText}>{publicUrl}</span>
                  </button>
                </>
              ) : null}
            </>
          }
        />
      )}
    </div>
  );
}

export const TEMPLATE_KIND_OPTIONS = TEMPLATE_KINDS.map((kind) => ({
  value: kind,
  label: TEMPLATE_KIND_LABELS[kind],
}));
