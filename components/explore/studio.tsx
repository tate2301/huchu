"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button, Drawer, Field, Input } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { AskAnswer } from "@/lib/explore/ask";
import { questionDocument, questionHref, questionReads, questionSql, readSlug } from "@/lib/explore/questions";
import { describeSteps } from "@/lib/explore/steps";
import { templateBySlug, templateTitle, type ExploreEngine } from "@/lib/explore/templates";
import type { CustomReport } from "@/lib/reports/custom/document";

import { setExploreReads } from "./explore-focus";
import { ExploreError, ExploreLoading, ExploreNotYours, ExplorePage } from "./explore-page";
import { ScheduleDrawer } from "./schedule-drawer";
import { StudioView, type AskMode, type StudioNote } from "./studio-view";
import { useExploreCatalog, useQuestion } from "./use-explore";

type Saved = Pick<CustomReport, "id" | "title" | "audience" | "canShare" | "editable">;

const AUDIENCE_LABEL: Record<CustomReport["audience"], string> = {
  JUST_ME: "Just you",
  MANAGERS: "Managers",
  EVERYONE: "Everyone",
};

/**
 * `/explore` itself: a new question for each address it is opened with. A
 * link from the panel (History, Start from a table) changes only the query
 * string, so the studio is keyed by the question the address carries.
 */
export function NewQuestionStudio() {
  const params = useSearchParams();
  const key = ["sql", "tables_sql", "title", "ask"].map((name) => params.get(name) ?? "").join("\u0000");
  return <Studio key={key} />;
}

/** The SQL's own order, for the arrow on the worksheet's header: `order by total desc`. */
function sqlSort(sql: string): { key: string; dir: "asc" | "desc" } | null {
  const match = /order\s+by\s+(?:[a-z_]+\.)?([a-z_][a-z0-9_]*)\s*(desc|asc)?/i.exec(sql);
  return match ? { key: match[1]!.toLowerCase(), dir: match[2]?.toLowerCase() === "desc" ? "desc" : "asc" } : null;
}

function clock(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The studio (`/explore`, `/explore/q/{slug}`): one question, asked in plain
 * words, read as steps, written as SQL, run over the workspace's tables as
 * Explore's own login (or, without it, in this tab over the person's report
 * sources), and saved as a report. `slug` is a saved question's id or a
 * template's slug; without one, `?sql=`, `?title=` and `?ask=` start it.
 */
export function Studio({ slug }: { slug?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const catalog = useExploreCatalog();

  const target = slug ? readSlug(slug) : null;
  const report = useQuery({
    queryKey: ["reports", "custom", target?.kind === "saved" ? target.id : null],
    queryFn: () => fetchJson<{ report: CustomReport }>(`/api/v2/reports/custom/${target!.kind === "saved" ? target!.id : ""}`),
    enabled: target?.kind === "saved",
  });

  // Where the question runs: a saved one where it was saved; a template where
  // the workspace's tables answer it, else over the reports; anything new as
  // the workspace runs Explore (`ExploreCatalog.engine`).
  const catalogEngine: ExploreEngine = catalog.data?.canUse ? catalog.data.engine : "sources";
  // One in code opens over the engine that has it; one from Corelith's
  // library is in the catalog, with the engine it is written over.
  const library = target?.kind === "template" && catalog.data?.canUse ? (catalog.data.templates.find((entry) => entry.slug === target.slug) ?? null) : null;
  const templateEngine: ExploreEngine =
    target?.kind !== "template"
      ? catalogEngine
      : templateBySlug(target.slug, catalogEngine)
        ? catalogEngine
        : templateBySlug(target.slug, "sources")
          ? "sources"
          : (library?.engine ?? catalogEngine);
  const template = target?.kind === "template" ? (templateBySlug(target.slug, templateEngine) ?? library) : null;
  const engine: ExploreEngine = target?.kind === "saved" ? (report.data ? questionReads(report.data.report) : catalogEngine) : templateEngine;

  // The question as it opens: a saved one's SQL, a template's, or the address's.
  const opening = React.useMemo(() => {
    if (target?.kind === "saved") {
      const loaded = report.data?.report;
      return loaded ? { sql: questionSql(loaded) ?? "", title: loaded.title } : null;
    }
    // A template or a new question waits for the catalog: it says which tables answer.
    if (!catalog.data) return null;
    if (target?.kind === "template") return template ? { sql: template.sql, title: templateTitle(template) } : { sql: "", title: "Untitled question" };
    const sql = (catalogEngine === "tables" ? params.get("tables_sql") : null) ?? params.get("sql") ?? "";
    return { sql, title: params.get("title") || "Untitled question" };
    // The address is read once, as the question opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, report.data, template, catalog.data]);

  const [sql, setSql] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("Untitled question");
  const [saved, setSaved] = React.useState<Saved | null>(null);
  React.useEffect(() => {
    if (!opening || sql !== null) return;
    setSql(opening.sql);
    setTitle(opening.title);
    if (report.data?.report) setSaved(report.data.report);
  }, [opening, sql, report.data]);

  const text = sql ?? "";
  const question = useQuestion(text, catalog.data, engine, title);
  const steps = React.useMemo(() => describeSteps(text), [text]);
  React.useEffect(() => {
    setExploreReads(question.reads);
  }, [question.reads]);
  React.useEffect(() => () => setExploreReads([]), []);

  // Ask in plain words: Vane drafts, the question on screen becomes an earlier version.
  const [askText, setAskText] = React.useState(params.get("ask") ?? "");
  const [mode, setMode] = React.useState<AskMode>("new");
  const [versions, setVersions] = React.useState<StudioNote["versions"]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const ask = useMutation({
    mutationFn: () => fetchJson<AskAnswer>("/api/explore/ask", { method: "POST", body: JSON.stringify({ question: askText, mode, sql: text || undefined, engine }) }),
    onSuccess: (answer) => {
      if (text.trim()) setVersions((list) => [{ sql: text, note: note ?? "As it was opened", at: clock() }, ...list].slice(0, 10));
      setSql(answer.sql);
      setNote(answer.note);
      if (mode === "new" && !saved) setTitle(askText.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 120));
      setMode("change");
    },
    onError: (error) => toast({ title: "Vane did not write it", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  // Opened from Ctrl K with a question: ask it once, as the person already asked.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (asked.current || !catalog.data?.canUse || !askText.trim() || text.trim() || sql === null) return;
    asked.current = true;
    ask.mutate();
  }, [catalog.data, askText, text, sql, ask]);

  // Saving: a saved question's SQL in place; a new one is named first.
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const save = useMutation({
    mutationFn: async (input: { title?: string; audience?: CustomReport["audience"] }) => {
      if (saved) {
        return fetchJson<{ report: CustomReport }>(`/api/v2/reports/custom/${saved.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...(input.audience ? { audience: input.audience } : { document: questionDocument(text, engine) }), ...(input.title ? { title: input.title } : {}) }),
        });
      }
      return fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", {
        method: "POST",
        body: JSON.stringify({ title: input.title ?? title, audience: "JUST_ME", document: questionDocument(text, engine) }),
      });
    },
    onSuccess: ({ report: next }, input) => {
      setSaved(next);
      setTitle(next.title);
      setNaming(false);
      void client.invalidateQueries({ queryKey: ["explore", "catalog"] });
      void client.invalidateQueries({ queryKey: ["reports"] });
      toast({ title: input.audience ? `${AUDIENCE_LABEL[next.audience]} can open it now` : "Saved", description: input.audience ? undefined : "It is in Saved, and in All reports." });
      if (pathname !== questionHref(next.id)) router.replace(questionHref(next.id), { scroll: false });
    },
    onError: (error) => toast({ title: "It was not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const onSave = () => {
    if (!text.trim()) return;
    if (saved?.editable) save.mutate({});
    else {
      setName(saved ? `${title} (copy)` : title === "Untitled question" ? "" : title);
      setNaming(true);
    }
  };

  const scheduling = params.get("schedule") !== null && Boolean(saved);
  const setScheduling = (on: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (on) next.set("schedule", "1");
    else next.delete("schedule");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const data = catalog.data;
  const loading = catalog.isPending || (target?.kind === "saved" && report.isPending) || sql === null;
  const runnable = Boolean(question.body);

  return (
    <>
      <PageChrome
        title={title}
        primary={
          data?.canUse
            ? saved
              ? { label: "Save", icon: "check", shortcut: "Ctrl S", onClick: onSave, disabled: !text.trim() ? "Write a question first" : undefined }
              : // Pressed on a refused question, it runs nothing: the guard's reason stays on screen.
                { label: "Run", icon: "run", shortcut: "Ctrl ↵", onClick: () => (runnable ? question.rerun() : undefined) }
            : null
        }
      >
        {data?.canUse ? (
          saved ? (
            <>
              <Button icon="calendar" onClick={() => setScheduling(true)}>
                Schedule
              </Button>
              <MenuButton
                icon="share"
                label="Share"
                align="end"
                items={[
                  { heading: "Who can open it" },
                  ...(["JUST_ME", "MANAGERS", "EVERYONE"] as const).map((audience) => ({
                    key: audience,
                    label: AUDIENCE_LABEL[audience],
                    checked: saved.audience === audience,
                    onSelect: () => {
                      if (!saved.editable) toast({ title: "Only its maker or a manager can share it", variant: "destructive" });
                      else save.mutate({ audience });
                    },
                  })),
                  { separator: true },
                  {
                    key: "copy",
                    label: "Copy the link",
                    icon: "link",
                    onSelect: () => {
                      void navigator.clipboard?.writeText(window.location.href.split("?")[0]!);
                      toast({ title: "The link is copied" });
                    },
                  },
                ]}
              >
                Share
              </MenuButton>
            </>
          ) : (
            <Button icon="check" shortcut="Ctrl S" disabled={!text.trim()} onClick={onSave}>
              Save
            </Button>
          )
        ) : undefined}
      </PageChrome>
      <ExplorePage>
        {catalog.isError ? (
          <ExploreError what="Explore" onRetry={() => catalog.refetch()} />
        ) : report.isError ? (
          <ExploreError what="The question" onRetry={() => report.refetch()} />
        ) : data && !data.canUse ? (
          <ExploreNotYours who={data.who} />
        ) : loading || !data ? (
          <ExploreLoading />
        ) : (
          <StudioView
            title={title}
            sql={text}
            onSql={setSql}
            tables={question.tables}
            checked={question.checked}
            steps={steps}
            periodStart={question.period.from}
            ask={{
              text: askText,
              mode,
              asking: ask.isPending,
              canChange: Boolean(text.trim()),
              onText: setAskText,
              onMode: setMode,
              onAsk: () => ask.mutate(),
            }}
            note={
              note
                ? {
                    text: `Vane ${versions.length ? "changed" : "wrote"} the question: ${note.replace(/^./, (c) => c.toLowerCase())}`,
                    versions,
                    onRestore: (index) => {
                      const version = versions[index]!;
                      setVersions((list) => [{ sql: text, note: note ?? "", at: clock() }, ...list.filter((_, at) => at !== index)]);
                      setSql(version.sql);
                      setNote(version.note);
                    },
                  }
                : null
            }
            result={question.result}
            running={question.running}
            error={question.error}
            onRerun={question.rerun}
            noun={template?.noun}
            sort={sqlSort(question.body ?? "")}
          />
        )}
      </ExplorePage>
      {saved ? <ScheduleDrawer open={scheduling} onOpenChange={setScheduling} question={{ id: saved.id, title }} /> : null}
      <Drawer
        open={naming}
        onOpenChange={setNaming}
        title="Save the question"
        width={420}
        footer={
          <>
            <Button icon="x" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!name.trim() || save.isPending} onClick={() => save.mutate({ title: name.trim() })}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Name" htmlFor="explore-name" help="It is kept in Saved, and in All reports, just for you until you share it.">
          <Input id="explore-name" autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Open quotes since September" />
        </Field>
      </Drawer>
    </>
  );
}
