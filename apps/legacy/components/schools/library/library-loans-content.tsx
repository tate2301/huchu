"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PageBand } from "@/components/schools/common/page-band";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  ClassFilter,
  ALL_CLASSES,
  type ClassFilterValue,
} from "@/components/schools/common/class-filter";
import {
  TableControls,
  TableSearch,
} from "@/components/schools/common/table-controls";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { formatSchoolMoney } from "@/lib/schools/format";
import { fetchSchoolsStudents } from "@/lib/schools/admin-v2";
import { LibraryViews } from "@/components/schools/library/library-views";

type Loan = {
  id: string;
  borrowedAt: string;
  dueAt: string;
  renewals: number;
  isOverdue: boolean;
  fineIfReturnedToday: number;
  copy: {
    id: string;
    copyCode: string;
    book: { id: string; title: string; author: string | null };
  };
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    currentClass: { id: string; name: string } | null;
  };
};

type LoansPage = {
  data: Loan[];
  pagination: { page: number; limit: number; total: number; pages: number };
  summary: { out: number; late: number; finesIfBackToday: number };
};

type Copy = {
  id: string;
  copyCode: string;
  loans: { id: string }[];
};

type Book = {
  id: string;
  title: string;
  author: string | null;
  shelfMark: string | null;
  copies: Copy[];
};

/**
 * The second line of a borrower's row, the way the canvas writes it:
 * "Things Fall Apart (TFA-007) · due 2026-08-21 · Form 2B" — the title, the
 * physical copy in that child's bag, the date it is wanted back, and the class
 * to send somebody to. Four facts in the order the person chasing it needs
 * them, and the class comes off cleanly when a borrower is between year groups.
 */
function loanLine(loan: Loan) {
  const parts = [
    `${loan.copy.book.title} (${loan.copy.copyCode})`,
    `due ${loan.dueAt.slice(0, 10)}`,
  ];
  if (loan.student.currentClass) parts.push(loan.student.currentClass.name);
  return parts.join(" · ");
}

/**
 * What is out, and what is late.
 *
 * The other half of the library. `/schools/library` is the catalogue; this is
 * the register — the list somebody actually works through on a Monday, which is
 * why it opens on what is overdue rather than on everything. "Show everything
 * out" is the way back to the whole register, and it is a toggle rather than
 * two screens because the difference between them is one clause of one query.
 *
 * Lateness is drawn in the danger tone and nowhere else on the row. A row that
 * is merely out is information; a row that is late is work, and the school is
 * owed money for it — so the badge carries the figure the fine would come to if
 * the book came back today. That number is shown, never stored: what is
 * actually charged is decided at the counter when the book is in hand.
 *
 * Its own route rather than a tab, so an overdue list can be sent to somebody.
 * Its own endpoint too — `/api/v2/schools/library/loans` — because dragging the
 * whole catalogue down the wire to draw forty slips is work nobody asked for.
 */
export function LibraryLoansContent() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [classes, setClasses] = useState<ClassFilterValue>(ALL_CLASSES);
  const [overdueOnly, setOverdueOnly] = useState(true);
  const [lending, setLending] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loansQuery = useQuery({
    queryKey: ["schools", "library", "loans", search, classes.classId, overdueOnly],
    queryFn: () =>
      fetchJson<LoansPage>(
        `/api/v2/schools/library/loans?${new URLSearchParams({
          limit: "200",
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(classes.classId ? { classId: classes.classId } : {}),
          ...(overdueOnly ? { overdueOnly: "true" } : {}),
        }).toString()}`,
      ),
  });

  const loans = useMemo(() => loansQuery.data?.data ?? [], [loansQuery.data]);
  const summary = loansQuery.data?.summary ?? null;

  const anyFilter = Boolean(search.trim() || classes.classId);

  /**
   * An empty register with nothing narrowing it is ambiguous, and the two
   * readings need different sentences: a school whose books are all on the
   * shelf has finished the job, and a school with no catalogue has not started
   * it. Only the shelf can tell them apart — so it is read here too, and only
   * at the moment the answer is actually needed. Every other time this stays
   * unfetched, which is the point the lazy `enabled` was making already.
   */
  const registerLooksEmpty =
    !loansQuery.isLoading && loans.length === 0 && !anyFilter && !overdueOnly;

  const shelfQuery = useQuery({
    queryKey: ["schools", "library", "shelf-for-lending"],
    queryFn: () => fetchJson<{ books: Book[] }>("/api/v2/schools/library"),
    enabled: lending || registerLooksEmpty,
  });

  // Only once the shelf has actually answered — an undefined book list is "not
  // asked yet", and treating it as zero flashes "nothing to lend" at a library
  // that has a thousand titles.
  const shelfIsBare =
    registerLooksEmpty && shelfQuery.isSuccess && shelfQuery.data.books.length === 0;

  const desk = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<{ fine?: number }>("/api/v2/schools/library/loans", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: (result, body) => {
      if (body.action === "return") {
        setNote(
          result.fine && result.fine > 0
            ? `Back, with ${formatSchoolMoney(result.fine)} to pay`
            : "Back, nothing owed",
        );
      } else if (body.action === "renew") {
        setNote("Renewed for another fortnight");
      } else {
        setNote(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["schools", "library"] });
    },
  });

  const verbsFor = (loan: Loan): RecordVerb[] => [
    {
      label: "Take it back",
      action: "edit",
      loading: pendingId === loan.id && desk.isPending,
      confirm: loan.isOverdue
        ? {
            title: `Take back ${loan.copy.book.title}`,
            description: `${loan.student.firstName} ${loan.student.lastName} owes ${formatSchoolMoney(loan.fineIfReturnedToday)} on this. Taking it back settles the loan and puts that fine on their record; it does not collect the money.`,
            confirmLabel: "Take it back",
          }
        : undefined,
      onSelect: () => {
        setPendingId(loan.id);
        desk.mutate({ action: "return", loanId: loan.id });
      },
    },
    {
      label: "Renew",
      action: "edit",
      loading: pendingId === loan.id && desk.isPending,
      onSelect: () => setEditing(loan),
    },
  ];

  return (
    <div className="space-y-4">
      <PageChrome title="Library">
        <CreateButton
          resource="schools.academics"
          action="edit"
          label="Lend a book"
          onSelect={() => setLending(true)}
        />
      </PageChrome>

      {/* The three numbers the canvas puts in the band: how much is out, how
          much of it is late, and what the lateness is worth today. */}
      <PageBand
        chips={[
          { label: "Out", value: summary ? summary.out : "—", tone: "brand" },
          {
            label: "Late",
            value: summary ? summary.late : "—",
            tone: summary && summary.late > 0 ? "danger" : "success",
          },
          {
            label: "Fines if back today",
            value: summary ? formatSchoolMoney(summary.finesIfBackToday) : "—",
            tone: summary && summary.finesIfBackToday > 0 ? "warn" : "success",
          },
        ]}
      />

      {loansQuery.error ? (
        <LoadError
          what="what is out"
          error={loansQuery.error}
          onRetry={() => void loansQuery.refetch()}
        />
      ) : null}
      {desk.error ? <SaveError what="That loan" error={desk.error} /> : null}
      {note ? (
        <Alert tone="success" title="Done" onDismiss={() => setNote(null)}>
          {note}
        </Alert>
      ) : null}

      <TableControls
        tabs={<LibraryViews out={summary?.out} />}
        search={
          <TableSearch
            label="Find a loan"
            placeholder="Borrower, title or accession number"
            value={search}
            onChange={setSearch}
          />
        }
        filters={
          <ClassFilter
            value={classes}
            onChange={setClasses}
            label="Year group"
            allLabel="Every year group"
            includeStreams={false}
          />
        }
        actions={
          <Button variant="secondary" onClick={() => setOverdueOnly((on) => !on)}>
            {overdueOnly ? "Show everything out" : "Only what is late"}
          </Button>
        }
      />

      <p className="text-sm text-muted-foreground">
        {loans.length} book{loans.length === 1 ? "" : "s"} out
        {summary && summary.late > 0 ? `, ${summary.late} late` : ""}
      </p>

      {loansQuery.isLoading ? (
        <TableRowsSkeleton
          headers={["Borrower", "What they have", "State", ""]}
          columns={[
            { avatar: true, twoLine: true },
            { width: 180 },
            { width: 150, badge: true },
            { width: 200 },
          ]}
        />
      ) : loansQuery.isError ? null : loans.length === 0 ? (
        anyFilter ? (
          <NothingMatched
            what="loans"
            filters={[search.trim(), classes.classId ? "that year group" : ""].filter(
              Boolean,
            )}
            onClear={() => {
              setSearch("");
              setClasses(ALL_CLASSES);
            }}
          />
        ) : overdueOnly ? (
          <NothingLeftToDo
            title="Nothing is late"
            body="Every book that is out is still within its date. Show everything out to see the rest of the register."
            action={
              <Button variant="secondary" onClick={() => setOverdueOnly(false)}>
                Show everything out
              </Button>
            }
          />
        ) : shelfIsBare ? (
          // An empty register means two different things and they get two
          // different sentences. A library with nothing on the shelf has never
          // started — the verb that fills it is putting books in the catalogue,
          // not lending one that does not exist.
          <NothingYet
            title="There is nothing to lend yet"
            body="The register fills itself once the catalogue has books in it. Add them on the catalogue, then lend one from here."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/library">Go to the catalogue</Link>
              </Button>
            }
          />
        ) : (
          <NothingLeftToDo title="Nothing is out" body="Every copy is on the shelf." />
        )
      ) : (
        // Taking a book back and renewing it both rewrite the loan the row
        // stands for. While one is in flight the register dims: the row still
        // shows both verbs, and "Take it back" pressed on a loan that is
        // already being returned settles it twice and fines twice.
        <SavingOverlay saving={desk.isPending} label="Writing it at the desk…">
          <ul className="divide-y divide-[color:var(--border-subtle)] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]">
            {loans.map((loan) => (
              <li key={loan.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <PersonAvatar
                  firstName={loan.student.firstName}
                  lastName={loan.student.lastName}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {loan.student.lastName}, {loan.student.firstName}
                  </span>
                  <span className="block truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                    {loanLine(loan)}
                  </span>
                </span>
                <Badge tone={loan.isOverdue ? "danger" : "warn"}>
                  {loan.isOverdue
                    ? `Late · ${formatSchoolMoney(loan.fineIfReturnedToday)} if back today`
                    : "Out"}
                </Badge>
                <RecordActions resource="schools.academics" verbs={verbsFor(loan)} />
              </li>
            ))}
          </ul>
        </SavingOverlay>
      )}

      <LendDialog
        open={lending}
        books={shelfQuery.data?.books ?? []}
        onClose={() => setLending(false)}
      />
      <RenewDialog loan={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/**
 * Lending, from the loans side.
 *
 * The catalogue lends a specific copy you are already looking at. Here the book
 * is what somebody names at the counter, so the choice is title first and copy
 * second — and only copies that are actually on the shelf are offered, because
 * a list containing books that are already out is a list that wastes the
 * librarian's next click.
 */
function LendDialog({
  open,
  books,
  onClose,
}: {
  open: boolean;
  books: Book[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [bookId, setBookId] = useState("");
  const [copyId, setCopyId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setBookId("");
    setCopyId("");
    setStudentId("");
  });

  const readersQuery = useQuery({
    queryKey: ["schools", "library", "readers"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 300, status: "ACTIVE" }),
    enabled: open,
  });

  const available = useMemo(() => {
    const book = books.find((row) => row.id === bookId);
    return (book?.copies ?? []).filter((copy) => copy.loans.length === 0);
  }, [books, bookId]);

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/schools/library/loans", {
        method: "POST",
        body: JSON.stringify({ action: "issue", copyId, studentId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "library"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Lend a book"
      description="Which title, which copy, and who is taking it."
      size="sm"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending && copyId && studentId) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={!copyId || !studentId}
          >
            Issue it
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FilterSelect
          label="Book"
          allLabel="Choose a book"
          className="space-y-2"
          value={bookId}
          options={books
            .filter((book) => book.copies.some((copy) => copy.loans.length === 0))
            .map((book) => ({
              value: book.id,
              label: book.author ? `${book.title} · ${book.author}` : book.title,
            }))}
          onChange={(value) => {
            setBookId(value);
            setCopyId("");
          }}
        />
        <FilterSelect
          label="Copy"
          allLabel={
            bookId && available.length === 0
              ? "Every copy is already out"
              : "Choose a copy"
          }
          className="space-y-2"
          value={copyId}
          options={available.map((copy) => ({
            value: copy.id,
            label: copy.copyCode,
          }))}
          onChange={setCopyId}
        />
        <FilterSelect
          label="Reader"
          allLabel="Choose a reader"
          className="space-y-2"
          value={studentId}
          options={(readersQuery.data?.data ?? []).map((student) => ({
            value: student.id,
            label: `${student.lastName}, ${student.firstName} · ${student.studentNo}`,
          }))}
          onChange={setStudentId}
        />
      </div>
    </RecordDialog>
  );
}

/**
 * Renewing, with the refusals said out loud before the button is pressed.
 *
 * A renewal is refused when somebody is waiting for the title and when the
 * school's renewal limit is reached, and both are decided by the API. The
 * dialog exists so the librarian sees what they are extending and by how long
 * — a bare "Renew" in a row gives no chance to notice it is the third time.
 */
function RenewDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(loan !== null, () => setError(null));

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/schools/library/loans", {
        method: "POST",
        body: JSON.stringify({ action: "renew", loanId: loan?.id }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "library"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={loan !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={loan ? `Renew ${loan.copy.book.title}` : "Renew"}
      description={
        loan
          ? `${loan.student.lastName}, ${loan.student.firstName} · ${loan.copy.copyCode}`
          : undefined
      }
      size="sm"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Renew it
          </Button>
        </>
      }
    >
      {loan ? (
        <div className="space-y-2 text-[length:var(--type-body-sm)]">
          <p>
            Wanted back{" "}
            <span className="font-[family-name:var(--font-mono)] tabular-nums">
              {loan.dueAt.slice(0, 10)}
            </span>
            . Renewing moves that on by a fortnight from today.
          </p>
          <p className="text-[color:var(--text-muted)]">
            {loan.renewals === 0
              ? "This has not been renewed before."
              : `Renewed ${loan.renewals} time${loan.renewals === 1 ? "" : "s"} already. Schools cap this, and the library will refuse past the cap.`}
          </p>
          {loan.isOverdue ? (
            <p className="text-[color:var(--tone-danger)]">
              It is already late. The{" "}
              {formatSchoolMoney(loan.fineIfReturnedToday)} owed so far stands
              whatever the new date says.
            </p>
          ) : null}
        </div>
      ) : null}
    </RecordDialog>
  );
}
