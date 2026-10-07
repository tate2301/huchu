"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { BarChart3, ChevronRight, ClipboardText, Globe, Grid3x3, Plus, ReceiptLong } from "@/lib/icons";

import styles from "./build-home.module.css";

type SetSummary = {
  id: string;
  name: string;
  kind: "PRODUCT" | "EVIDENCE" | "CLOSEOUT";
  isActive: boolean;
  product: { id: string; name: string } | null;
  questionCount: number;
  visitCount: number;
  quoteLineCount: number;
};

type Template = {
  key: string;
  name: string;
  description: string;
  kind: SetSummary["kind"];
  group: "measured" | "bank";
  questionCount: number;
  quoteLineCount: number;
  preview: Array<{ label: string; kind: string }>;
};

type IntakeForm = { id: string; name: string; isActive: boolean; submissionCount: number; fields: unknown[] | null };
type CustomReport = { id: string; title: string; description: string | null; shared: boolean; editable: boolean };

const WHERE: Record<SetSummary["kind"], string> = {
  PRODUCT: "When quoting",
  EVIDENCE: "Every visit",
  CLOSEOUT: "Every visit, last",
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * Everything a workspace has built to ask and to report, grouped by where it
 * is used, with the templates to start the next one from.
 */
export function BuildHome() {
  const router = useRouter();
  const { toast } = useToast();
  const [allBank, setAllBank] = useState(false);

  const sets = useQuery({ queryKey: ["crm", "question-sets"], queryFn: () => fetchJson<{ data: SetSummary[]; canEdit: boolean }>("/api/v2/crm/question-sets") });
  const templates = useQuery({ queryKey: ["crm", "question-set-templates"], queryFn: () => fetchJson<{ data: Template[] }>("/api/v2/crm/question-sets/templates") });
  const forms = useQuery({ queryKey: ["crm-intake-forms"], queryFn: () => fetchJson<{ data: IntakeForm[] }>("/api/v2/crm/intake-forms"), retry: false });
  const reports = useQuery({ queryKey: ["reports", "catalog"], queryFn: () => fetchJson<{ custom: CustomReport[] }>("/api/v2/reports"), retry: false });

  const start = useMutation({
    mutationFn: (body: { template: string } | { blank: true }) =>
      fetchJson<{ set: { id: string } }>("/api/v2/crm/question-sets", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ set }) => router.push(`/crm/build/visits/${set.id}`),
    onError: (error) => toast({ title: "Could not start the form", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const canEdit = sets.data?.canEdit ?? false;
  const visitForms = sets.data?.data ?? [];
  const inUse = visitForms.filter((set) => set.isActive).length + (forms.data?.data.filter((form) => form.isActive).length ?? 0) + (reports.data?.custom.length ?? 0);
  const quoting = visitForms.filter((set) => set.quoteLineCount > 0);
  const opened = visitForms.reduce((sum, set) => sum + set.visitCount, 0);
  const measured = templates.data?.data.filter((template) => template.group === "measured") ?? [];
  const bank = templates.data?.data.filter((template) => template.group === "bank") ?? [];

  return (
    <>
      <PageChrome title="Build">
        {canEdit ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={start.isPending} onClick={() => start.mutate({ blank: true })}>
              <Plus aria-hidden className="mr-1 h-4 w-4" />
              Blank form
            </Button>
            <Button type="button" size="sm" onClick={() => document.getElementById("templates")?.scrollIntoView({ behavior: "smooth" })}>
              <Grid3x3 aria-hidden className="mr-1 h-4 w-4" />
              Start from a template
            </Button>
          </>
        ) : null}
      </PageChrome>

      <div className={styles.home}>
        {sets.isLoading ? (
          <Skeleton className="h-16 w-2/3" />
        ) : (
          <p className={styles.lede}>
            {plural(inUse, "form and report", "forms and reports")} in use.
            <span>
              {quoting.length > 0
                ? `${plural(quoting.length, "site visit form")} ${quoting.length === 1 ? "drafts" : "draft"} the quote from what the rep measures.`
                : opened > 0
                  ? `Site visit forms have been opened on ${plural(opened, "visit")}. Add quote lines and they draft the quote too.`
                  : "Build what your reps ask on site, and the quote it drafts."}
            </span>
          </p>
        )}

        {canEdit ? (
          <section id="templates" aria-labelledby="templates-title">
            <div className={styles.sectionHead}>
              <h2 id="templates-title" className={styles.sectionTitle}>
                Start from a template
              </h2>
              <span className={styles.sectionNote}>Made for flooring work. Measured once, quoted from the measurements.</span>
            </div>
            <div className={styles.cards}>
              {templates.isLoading
                ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-56" />)
                : measured.map((template) => (
                    <button key={template.key} type="button" className={styles.card} disabled={start.isPending} onClick={() => start.mutate({ template: template.key })}>
                      <div className={styles.sketch} aria-hidden>
                        <div className={styles.sketchSheet}>
                          {template.preview.map((question) => (
                            <span key={question.label} className={styles.sketchQuestion}>
                              {question.label}
                              <small>{question.kind.toLowerCase()}</small>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className={styles.cardBody}>
                        <span className={styles.cardTitle}>{template.name}</span>
                        <span className={styles.cardText}>{template.description}</span>
                        <span className={styles.cardMeta}>
                          {template.quoteLineCount ? <ReceiptLong aria-hidden /> : <ClipboardText aria-hidden />}
                          {template.kind === "PRODUCT" ? "Site visit" : "Every visit"} · {plural(template.questionCount, "question")}
                          {template.quoteLineCount ? ` · ${plural(template.quoteLineCount, "quote line")}` : ""}
                        </span>
                      </div>
                    </button>
                  ))}
            </div>
            {bank.length ? (
              <>
                <div className={styles.sectionHead} style={{ marginTop: 20, marginBottom: 0 }}>
                  <h3 className={styles.sectionTitle} style={{ fontSize: 14 }}>
                    From your question bank
                  </h3>
                  <span className={styles.sectionNote}>Each section as a form of its own, to rebuild with measurements</span>
                </div>
                <div className={styles.bank}>
                  {(allBank ? bank : bank.slice(0, 6)).map((template) => (
                    <button key={template.key} type="button" className={styles.bankItem} disabled={start.isPending} onClick={() => start.mutate({ template: template.key })}>
                      {template.name}
                      <small>{template.questionCount}</small>
                    </button>
                  ))}
                </div>
                {bank.length > 6 ? (
                  <button type="button" className={styles.more} onClick={() => setAllBank(!allBank)}>
                    {allBank ? "Fewer" : `All ${bank.length} sections`}
                  </button>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="visits-title">
          <div className={styles.sectionHead}>
            <h2 id="visits-title" className={styles.sectionTitle}>
              Site visits
            </h2>
            <span className={styles.sectionNote}>
              {visitForms.length} · asked on site by the rep, on the phone
            </span>
          </div>
          <div className={styles.list}>
            {sets.isLoading ? <Skeleton className="h-40" /> : null}
            {sets.error ? <p className={styles.empty}>{getApiErrorMessage(sets.error)}</p> : null}
            {visitForms.map((set) => (
              <Link key={set.id} href={`/crm/build/visits/${set.id}`} className={styles.item}>
                <ClipboardText aria-hidden />
                <span className={styles.itemName}>{set.name}</span>
                <span className={styles.itemWhere}>
                  {set.product ? set.product.name : WHERE[set.kind]} · {plural(set.questionCount, "question")}
                  {set.quoteLineCount ? ` · drafts a quote` : ""}
                </span>
                <span className={styles.itemCount}>{set.visitCount ? plural(set.visitCount, "visit") : "—"}</span>
                <span className={styles.status}>
                  <span className={styles.dot} data-off={!set.isActive} aria-hidden />
                  {set.isActive ? "In use" : "Draft"}
                </span>
                <ChevronRight aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {forms.data ? (
          <section aria-labelledby="enquiries-title">
            <div className={styles.sectionHead}>
              <h2 id="enquiries-title" className={styles.sectionTitle}>
                Enquiries
              </h2>
              <span className={styles.sectionNote}>{forms.data.data.length} · filled in by customers, before anyone has met them</span>
            </div>
            <div className={styles.list}>
              {forms.data.data.length === 0 ? <p className={styles.empty}>No enquiry forms yet.</p> : null}
              {forms.data.data.map((form) => (
                <Link key={form.id} href={`/crm/build/enquiries/${form.id}`} className={styles.item}>
                  <Globe aria-hidden />
                  <span className={styles.itemName}>{form.name}</span>
                  <span className={styles.itemWhere}>{plural(form.fields?.length ?? 0, "question")} · becomes a lead</span>
                  <span className={styles.itemCount}>{form.submissionCount ? plural(form.submissionCount, "enquiry", "enquiries") : "—"}</span>
                  <span className={styles.status}>
                    <span className={styles.dot} data-off={!form.isActive} aria-hidden />
                    {form.isActive ? "In use" : "Off"}
                  </span>
                  <ChevronRight aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {reports.data ? (
          <section aria-labelledby="reports-title">
            <div className={styles.sectionHead}>
              <h2 id="reports-title" className={styles.sectionTitle}>
                Reports
              </h2>
              <span className={styles.sectionNote}>{reports.data.custom.length} · built here, from what the forms collect</span>
            </div>
            <div className={styles.list}>
              {reports.data.custom.length === 0 ? (
                <p className={styles.empty}>
                  No reports built yet. <Link href="/reports">Build one from the reports</Link>.
                </p>
              ) : null}
              {reports.data.custom.map((report) => (
                <Link key={report.id} href={report.editable ? `/reports/custom/${report.id}/edit` : `/reports/custom/${report.id}`} className={styles.item}>
                  <BarChart3 aria-hidden />
                  <span className={styles.itemName}>{report.title}</span>
                  <span className={styles.itemWhere}>{report.description ?? (report.shared ? "Shared" : "Only you")}</span>
                  <span className={styles.itemCount} />
                  <span className={styles.status}>
                    <span className={styles.dot} data-off={!report.shared} aria-hidden />
                    {report.shared ? "Shared" : "Private"}
                  </span>
                  <ChevronRight aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
