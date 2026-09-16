"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import {
  ListRowsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
} from "@/components/records/states";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PageCaption } from "@/components/schools/records/page-caption";
import {
  CLEARANCE_LABELS,
  LEAVING_REASON_LABELS,
  fetchLeaverQueue,
  fetchLeavingDocuments,
} from "@/lib/schools/leavers-v2";
import { formatSchoolDate } from "@/lib/schools/format";

/**
 * Leaving documents — the five a pupil goes home with.
 *
 * Exactly one of the five exists in the document pipeline today
 * (`schools.transfer-letter`). The other four need a source key, an access
 * entry, a `resolveSchoolDocument` case, a resolver and a default template —
 * four edits across two files each, and **no new renderer**:
 * `lib/documents/schools-sources.ts` says why in its own header, and a
 * school-specific renderer would be a second layout to keep in step with the
 * first and a second place for a logo to go missing.
 *
 * So this screen tells the truth about all five rather than drawing five
 * buttons three of them cannot honour: `Ready to raise`, `Blocked` with the
 * mark that blocks it, or `The template has not been written yet`.
 *
 * The certificate preview on the artboard is a **preview**. The artefact comes
 * out of the pipeline, branded, with the tenant's letterhead.
 */
export function LeavingDocumentsContent({ leaverId }: { leaverId?: string }) {
  const [selected, setSelected] = useState(leaverId ?? "");

  const queueQuery = useQuery({
    queryKey: ["schools", "leavers", "open"],
    queryFn: () => fetchLeaverQueue({ status: "open" }),
  });

  const activeId = selected || queueQuery.data?.rows[0]?.id || "";

  const documentsQuery = useQuery({
    queryKey: ["schools", "leavers", "documents", activeId],
    queryFn: () => fetchLeavingDocuments(activeId),
    enabled: Boolean(activeId),
  });

  const page = documentsQuery.data;
  const pupil = page?.leaver.student;
  const documents = page?.documents ?? [];
  const owing = page?.leaver.clearances.find((mark) => mark.kind === "FEES");

  return (
    <SchoolsPage
      band={
        <PageBand
          chips={[
            {
              label: "Raised",
              value: documents.filter((document) => document.state === "ready").length || "—",
              tone: "success",
            },
            {
              label: "Ready to raise",
              value: documents.filter((document) => document.state === "ready").length || "—",
            },
            {
              label: "Blocked",
              value: documents.filter((document) => document.state !== "ready").length || "—",
              tone: documents.some((document) => document.state !== "ready") ? "warn" : "neutral",
            },
            {
              label: "Owing",
              value: owing?.state === "TODO" ? (owing.detail ?? "Yes") : "Nothing",
              tone: owing?.state === "TODO" ? "danger" : "success",
            },
          ]}
        />
      }
    >
      <PageChrome title="Leaving documents" backHref="/schools/leavers" backLabel="Leavers">
        {page ? (
          <PrintDocumentButton
            sourceKey="schools.transfer-letter"
            filters={{ studentId: page.leaver.student.id }}
            label="Raise the certificate"
          />
        ) : null}
      </PageChrome>

      {pupil ? (
        <PageCaption>
          {pupil.firstName} {pupil.lastName} · {pupil.studentNo}
          {pupil.currentClass ? ` · ${pupil.currentClass.name}` : ""}
          {pupil.currentStream ? ` ${pupil.currentStream.name}` : ""} · left{" "}
          {formatSchoolDate(page?.leaver.lastDay)}
        </PageCaption>
      ) : null}

      <FilterSelect
        label="Leaver"
        allLabel="The first in the queue"
        value={selected}
        options={(queueQuery.data?.rows ?? []).map((row) => ({
          value: row.id,
          label: `${row.student.lastName}, ${row.student.firstName} · ${LEAVING_REASON_LABELS[row.reason]}`,
        }))}
        onChange={setSelected}
      />

      {selected && (queueQuery.data?.rows ?? []).every((row) => row.id !== selected) ? (
        <NothingMatched
          what="leavers"
          filters={["that leaver"]}
          onClear={() => setSelected("")}
        />
      ) : null}

      {queueQuery.error ? (
        <LoadError
          what="the leaving queue"
          error={queueQuery.error}
          onRetry={() => void queueQuery.refetch()}
        />
      ) : !activeId && !queueQuery.isPending ? (
        <NothingYet
          title="Nobody is in the leaving queue"
          body="Record a leaver and their five documents appear here, each with what is blocking it."
          action={
            <Button asChild>
              <Link href="/schools/leavers">Open the leaving queue</Link>
            </Button>
          }
        />
      ) : documentsQuery.isPending ? (
        <ListRowsSkeleton rows={5} label="Reading the documents" />
      ) : documentsQuery.error ? (
        <LoadError
          what="the documents"
          error={documentsQuery.error}
          onRetry={() => void documentsQuery.refetch()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-2">
            <h2 className="flex items-baseline justify-between border-b border-[color:var(--border-subtle)] pb-1.5">
              <span className="text-sm font-semibold text-[color:var(--text-strong)]">
                The five documents
              </span>
              <span className="text-xs text-[color:var(--text-muted)]">
                {documents.filter((document) => document.state === "ready").length} of{" "}
                {documents.length} ready
              </span>
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--text-muted)]">
                  <th className="py-1 font-normal">Document</th>
                  <th className="w-[120px] py-1 font-normal">State</th>
                  <th className="py-1 font-normal">Detail</th>
                  <th className="w-[150px] py-1 text-right font-normal">Signed by</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.key} className="border-t border-[color:var(--border-subtle)]">
                    <td className="py-2">{document.label}</td>
                    <td className="py-2">
                      <Badge
                        tone={
                          document.state === "ready"
                            ? "success"
                            : document.state === "blocked"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {document.state === "ready"
                          ? "Ready to raise"
                          : document.state === "blocked"
                            ? "Blocked"
                            : "Not built yet"}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs text-[color:var(--text-muted)]">
                      {document.detail}
                    </td>
                    <td className="py-2 text-right">
                      {document.state === "ready" ? (
                        <span className="flex justify-end gap-2">
                          <PrintDocumentButton
                            sourceKey="schools.transfer-letter"
                            filters={{ studentId: page?.leaver.student.id ?? "" }}
                            label="Raise it"
                          />
                          {/* The same document again. A leaving certificate is
                              lost more often than any other thing a school
                              issues, and a second copy is a reprint rather than
                              a new document — so it is the same source key and
                              not a new artefact. */}
                          <PrintDocumentButton
                            sourceKey="schools.transfer-letter"
                            filters={{ studentId: page?.leaver.student.id ?? "" }}
                            label="Print again"
                          />
                        </span>
                      ) : document.needs === "FEES" ? (
                        // Two ways past a fee, and they are different
                        // decisions: the family pays, or the head writes it
                        // off. Both happen on the ledger, which owns the money.
                        <span className="flex justify-end gap-2">
                          <Button asChild variant="secondary" size="sm">
                            <Link href="/schools/finance/ledger?view=receipts">
                              Record a payment
                            </Link>
                          </Button>
                          <Button asChild variant="secondary" size="sm">
                            <Link href="/schools/finance/ledger?view=waivers">Waive it</Link>
                          </Button>
                        </span>
                      ) : document.needs === "RESULTS" ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href="/schools/results/publish">Open publishing</Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-[color:var(--text-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-[color:var(--text-muted)]">
              Four of the five need a template and a resolver in the shared document pipeline
              before they can be raised. The pipeline owns the letterhead, the branding and the
              PDF — there is no second renderer here, deliberately.
            </p>
          </section>

          {/* A preview, at A4 proportion, so a reader can see what the pipeline
              will produce. It is not the artefact. */}
          <section className="space-y-2">
            <h2 className="border-b border-[color:var(--border-subtle)] pb-1.5 text-sm font-semibold text-[color:var(--text-strong)]">
              The certificate
            </h2>
            <div
              className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-base)] p-4"
              style={{ aspectRatio: "1 / 1.414" }}
            >
              <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                School-leaving certificate
              </p>
              <p className="mt-6 text-center text-lg font-semibold">
                {pupil ? `${pupil.firstName} ${pupil.lastName}` : ""}
              </p>
              <p className="mt-1 text-center text-xs text-[color:var(--text-muted)]">
                {pupil?.studentNo}
                {pupil?.currentClass ? ` · ${pupil.currentClass.name}` : ""}
              </p>
              <p className="mt-6 text-center text-xs">
                left this school on {formatSchoolDate(page?.leaver.lastDay)}
              </p>
              <p className="mt-1 text-center text-xs text-[color:var(--text-muted)]">
                {page ? LEAVING_REASON_LABELS[page.leaver.reason] : ""}
              </p>
              <p className="mt-10 text-center text-[10px] text-[color:var(--text-faint)]">
                A preview. The certificate itself comes out of the document pipeline with the
                school&rsquo;s letterhead on it.
              </p>
            </div>
            {owing?.state === "TODO" ? (
              <p className="text-xs text-[color:var(--tone-warn)]">
                {CLEARANCE_LABELS.FEES}: {owing.detail}. The certificate is blocked until that is
                settled or the head waives it.
              </p>
            ) : null}
          </section>
        </div>
      )}
    </SchoolsPage>
  );
}
