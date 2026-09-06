"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@corelithzw/react";
import {
  CardsSkeleton,
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { BookCover } from "@/components/schools/library/book-cover";
import { Clock, Info, MedusaBookOpenIcon, Search } from "@corelithzw/ui/lib/icons";
import { fetchJson } from "@/lib/api-client";
import { useStudentPortal } from "./student-portal-context";

type Book = {
  id: string;
  title: string;
  author: string | null;
  category: string | null;
  shelfMark: string | null;
  copies: number;
  available: number;
  waiting: number;
  haveItOut: boolean;
  reservedByMe: boolean;
};

type Loan = {
  id: string;
  dueAt: string | null;
  renewals: number;
  isOverdue: boolean;
  fineIfReturnedToday: string | number;
  copyCode: string;
  book: { id: string; title: string; author: string | null };
};

type Library = {
  canBorrow: boolean;
  loans: Loan[];
  fines: { total: string | number };
  reservations: Array<{
    id: string;
    readyAt: string | null;
    book: { id: string; title: string; author: string | null };
  }>;
  books: Book[];
};

function money(value: string | number) {
  return `$ ${Number(value).toFixed(2)}`;
}

function shortDate(value: string | null) {
  if (!value) return "no date";
  const date = new Date(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Whole days from today to the due date, negative once it has passed. */
function daysLeft(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** The demo's three due looks: plain, amber "soon", red "overdue". */
function dueLook(loan: Loan) {
  if (loan.isOverdue) {
    return {
      tone: "overdue",
      label: `Overdue · ${money(loan.fineIfReturnedToday)} to pay`,
    };
  }
  const left = daysLeft(loan.dueAt);
  if (left !== null && left <= 3) {
    return {
      tone: "urgent",
      label: `Bring back in ${left} ${left === 1 ? "day" : "days"} · ${shortDate(loan.dueAt)}`,
    };
  }
  return {
    tone: "",
    label:
      left === null
        ? "No date to bring it back by"
        : `Bring back ${shortDate(loan.dueAt)} · ${left} days`,
  };
}

/**
 * The library, as the prototype draws it.
 *
 * What the pupil has out comes first — that is the thing with a deadline on it —
 * each loan as a card with its cover, when it is due and the two things you can
 * do about it. The shelf is underneath, one row per title, because a row can say
 * "3 of 3 on the shelf" and a cover tile cannot.
 *
 * Whether a book can be taken home is counted from copies, not titles: "three
 * copies, two out" is the only honest answer to "can I have it today".
 *
 * The demo also offers a barcode scanner for returns. There is no scanner behind
 * it here, so the card is not drawn — a dead camera button on a library screen
 * is worse than a Return button that works.
 */
export function StudentLibraryScreen() {
  const queryClient = useQueryClient();
  const { student } = useStudentPortal();
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "portal", "student", "library", search],
    queryFn: () =>
      fetchJson<Library>(
        `/api/v2/schools/portal/student/me/library${search ? `?search=${encodeURIComponent(search)}` : ""}`,
      ),
    enabled: Boolean(student),
  });

  const act = useMutation({
    mutationFn: (body: Record<string, string>) =>
      fetchJson("/api/v2/schools/portal/student/me/library", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, body) => {
      setNote(
        body.action === "borrow"
          ? "Borrowed — check the due date below"
          : body.action === "return"
            ? "Returned"
            : body.action === "renew"
              ? "Renewed"
              : "Reserved — we will tell you when it is ready",
      );
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "student", "library"],
      });
    },
  });

  if (!student) {
    return (
      <NothingYet
        title="This account is not linked to a pupil"
        body="Ask the school office to link your sign-in to your student record."
      />
    );
  }

  const data = query.data;
  const fines = Number(data?.fines.total ?? 0);
  const loans = data?.loans ?? [];
  const books = data?.books ?? [];

  return (
    <div className="flex flex-col">
      <div className="sp-search">
        <span className="sp-search-ic">
          <Search className="size-4" aria-hidden />
        </span>
        <input
          aria-label="Search the library"
          placeholder="Search by title or author…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {query.error ? (
        <LoadError
          what="the library"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {act.error ? <SaveError what="That book" error={act.error} /> : null}
      {note ? (
        <Alert tone="success" title={note} onDismiss={() => setNote(null)} />
      ) : null}

      {fines > 0 ? (
        <div className="sp-fines mt-3">
          <span className="sp-fines-ic">
            <Info className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="sp-fines-nm">You owe a fine</div>
            <div className="sp-fines-sb">
              Pay at the library desk. You cannot borrow again until it is
              settled.
            </div>
          </div>
          <span className="sp-fines-val">{money(fines)}</span>
        </div>
      ) : null}

      <div className="sp-psh">Books you have out · {loans.length}</div>

      {query.isPending ? (
        /* Each loan is a cover, a title and a due line — a card. */
        <CardsSkeleton count={2} columns={1} lines={2} />
      ) : loans.length === 0 ? (
        /* An empty shelf-at-home is not a job undone; nothing is overdue and
           nothing needs bringing back. */
        <NothingLeftToDo
          title="Nothing out at the moment"
          body="Nothing to bring back and no fines to worry about. Pick something from the shelf below and it will show up here."
        />
      ) : (
        /* The loans dim while a renew or a return is in flight, so a pupil who
           taps twice does not renew twice. */
        <SavingOverlay saving={act.isPending} label="Just a moment…">
          {loans.map((loan) => {
            const due = dueLook(loan);
            return (
              <div key={loan.id} className="sp-borrow-card">
                <div className="sp-cover w-[56px]">
                  <BookCover
                    title={loan.book.title}
                    author={loan.book.author}
                    size="sm"
                  />
                </div>
                <div className="min-w-0">
                  <div className="sp-bc-nm">{loan.book.title}</div>
                  <div className="sp-bc-sb">
                    {loan.book.author ?? "Unknown author"}
                    {loan.renewals > 0 ? ` · renewed ${loan.renewals}×` : ""}
                  </div>
                  <div className={`sp-bc-due ${due.tone}`}>
                    <Clock className="size-[11px]" aria-hidden />
                    {due.label}
                  </div>
                </div>
                <div className="sp-bc-acts">
                  <button
                    type="button"
                    className="sp-renew"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ action: "renew", loanId: loan.id })}
                  >
                    Keep longer
                  </button>
                  <button
                    type="button"
                    className={`sp-renew${loan.isOverdue ? " danger" : ""}`}
                    disabled={act.isPending}
                    onClick={() => act.mutate({ action: "return", loanId: loan.id })}
                  >
                    Bring back
                  </button>
                </div>
              </div>
            );
          })}
        </SavingOverlay>
      )}

      <div className="sp-psh">The shelf · {books.length}</div>

      {query.isPending ? (
        <CardsSkeleton count={5} columns={1} lines={2} />
      ) : books.length === 0 ? (
        /* Two different sentences: a search that found nothing repeats what
           was typed and offers to clear it; an empty catalogue is the school's
           first day and has no filter to clear. */
        search ? (
          <NothingMatched
            what="books"
            filters={[`“${search}”`]}
            onClear={() => setSearch("")}
          />
        ) : (
          <NothingYet
            icon={<MedusaBookOpenIcon className="size-5" aria-hidden />}
            title="The shelf is empty"
            body="No books have been catalogued yet. The librarian adds them from the office, and they turn up here as soon as they do."
          />
        )
      ) : (
        <SavingOverlay saving={act.isPending} label="Just a moment…">
          {books.map((book) => (
            <div key={book.id} className="sp-catalog-card">
              <div className="sp-cover sm w-[42px]">
                <BookCover title={book.title} author={book.author} size="sm" />
              </div>
              <div className="min-w-0">
                <div className="sp-cc-nm">{book.title}</div>
                <div className="sp-cc-sb truncate">
                  {[book.author ?? "Unknown author", book.category]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="sp-cc-sb">
                  {book.available > 0
                    ? `${book.available} of ${book.copies} on the shelf`
                    : book.waiting > 0
                      ? `All out · ${book.waiting} waiting`
                      : "All out"}
                </div>
              </div>
              {book.haveItOut ? (
                <span className="sp-out-pill">You have this</span>
              ) : book.reservedByMe ? (
                <span className="sp-out-pill">On hold</span>
              ) : book.available > 0 ? (
                <button
                  type="button"
                  className="sp-borrow-btn"
                  disabled={!data?.canBorrow || act.isPending}
                  onClick={() => act.mutate({ action: "borrow", bookId: book.id })}
                >
                  Take out
                </button>
              ) : (
                <button
                  type="button"
                  className="sp-renew"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: "reserve", bookId: book.id })}
                >
                  Hold for me
                </button>
              )}
            </div>
          ))}
        </SavingOverlay>
      )}
    </div>
  );
}
