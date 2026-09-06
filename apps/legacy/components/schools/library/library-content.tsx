"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { PageBand } from "@/components/schools/common/page-band";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { FilterSelect } from "@/components/schools/common/filter-select";
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
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { formatSchoolMoney } from "@/lib/schools/format";
import { fetchSchoolsStudents } from "@/lib/schools/admin-v2";
import { BookCover } from "@/components/schools/library/book-cover";
import { LibraryViews } from "@/components/schools/library/library-views";

type Copy = {
  id: string;
  copyCode: string;
  loans: {
    id: string;
    dueAt: string;
    student: { id: string; firstName: string; lastName: string };
  }[];
};

type Book = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher?: string | null;
  category: string | null;
  shelfMark: string | null;
  copies: Copy[];
  _count: { reservations: number };
};

type Loan = {
  id: string;
  dueAt: string;
  isOverdue: boolean;
};

/**
 * How the canvas writes a title with its author on the opened book's header:
 * "Things Fall Apart · Chinua Achebe". A title with nobody credited keeps the
 * separator off rather than printing a trailing middot into a gap.
 */
function bookLabel(book: { title: string; author: string | null }) {
  return book.author ? `${book.title} · ${book.author}` : book.title;
}

/**
 * The line under a cover, in the canvas's words: "11 of 14 in · AFR 823.9" —
 * how many are on the shelf out of how many exist, then where to walk to. The
 * count leads because that is the question asked at the counter; the shelf mark
 * follows because it is the answer to the next one.
 */
function shelfLine(book: Book) {
  const out = book.copies.filter((copy) => copy.loans.length > 0).length;
  const total = book.copies.length;
  return `${total - out} of ${total} in${book.shelfMark ? ` · ${book.shelfMark}` : ""}`;
}

/**
 * The shelves — the catalogue half of the library.
 *
 * The library has two halves and they are now two routes rather than two pieces
 * of view state: this one, the catalogue, and `/schools/library/loans`, the
 * register of what is out. A librarian working the overdue list wants to send
 * somebody that list, and a view living in `useState` has no address to send.
 * `LibraryViews` keeps them reading as siblings — one segmented strip in the
 * control row, exactly where the canvas draws it.
 *
 * The catalogue is built from the copies outward, so a copy on the shelf is a
 * row you can lend rather than an absence. It is a grid of covers and not a
 * table because a librarian looking for a title recognises the spine before the
 * words; the copies of one book open underneath it, since the desk works a book
 * at a time.
 *
 * Add, edit, withdraw. Before these the library could lend a book and could not
 * catalogue one, correct a misspelt author, or retire a title that fell apart.
 */
export function LibraryContent() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [shelfFilter, setShelfFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [copyFilter, setCopyFilter] = useState("");
  const [lendingCopy, setLendingCopy] = useState<string | null>(null);
  /** Which cover has been opened. The desk works one book at a time. */
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [reader, setReader] = useState("");
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [addingBook, setAddingBook] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const libraryQuery = useQuery({
    queryKey: ["schools", "library", "shelves", search],
    queryFn: () =>
      fetchJson<{ books: Book[]; loans: Loan[] }>(
        `/api/v2/schools/library?${new URLSearchParams(
          search.trim() ? { search: search.trim() } : {},
        ).toString()}`,
      ),
  });

  const readersQuery = useQuery({
    queryKey: ["schools", "library", "readers"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 300, status: "ACTIVE" }),
    enabled: lendingCopy !== null,
  });

  const allBooks = useMemo(() => libraryQuery.data?.books ?? [], [libraryQuery.data]);
  const allLoans = useMemo(() => libraryQuery.data?.loans ?? [], [libraryQuery.data]);

  const shelves = useMemo(
    () =>
      [
        ...new Set(
          allBooks
            .map((book) => book.shelfMark)
            .filter((mark): mark is string => Boolean(mark)),
        ),
      ]
        .sort()
        .map((mark) => ({ value: mark, label: mark })),
    [allBooks],
  );

  const genres = useMemo(
    () =>
      [
        ...new Set(
          allBooks
            .map((book) => book.category)
            .filter((genre): genre is string => Boolean(genre)),
        ),
      ]
        .sort()
        .map((genre) => ({ value: genre, label: genre })),
    [allBooks],
  );

  const books = useMemo(
    () =>
      allBooks.filter((book) => {
        if (shelfFilter && book.shelfMark !== shelfFilter) return false;
        if (genreFilter && book.category !== genreFilter) return false;
        const out = book.copies.filter((copy) => copy.loans.length > 0).length;
        if (copyFilter === "in" && out === book.copies.length) return false;
        if (copyFilter === "out" && out === 0) return false;
        return true;
      }),
    [allBooks, shelfFilter, genreFilter, copyFilter],
  );

  const deskMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<{ fine?: number }>("/api/v2/schools/library/loans", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result, body) => {
      setLendingCopy(null);
      setReader("");
      if (body.action === "return") {
        setNote(
          result.fine && result.fine > 0
            ? `Back, with ${formatSchoolMoney(result.fine)} to pay`
            : "Back, nothing owed",
        );
      } else {
        setNote(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["schools", "library"] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (bookId: string) =>
      fetchJson(`/api/v2/schools/library/${bookId}`, { method: "DELETE" }),
    onSuccess: () => {
      setOpenBook(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "library"] });
    },
  });

  const overdue = allLoans.filter((loan) => loan.isOverdue);
  const onShelf = allBooks.reduce(
    (sum, book) => sum + book.copies.filter((copy) => copy.loans.length === 0).length,
    0,
  );
  const copies = allBooks.reduce((sum, book) => sum + book.copies.length, 0);

  const desk = deskMutation.isPending;
  const anyFilter = Boolean(shelfFilter || genreFilter || copyFilter || search.trim());

  return (
    <div className="space-y-4">
      <PageChrome title="Library">
        <CreateButton
          resource="schools.academics"
          label="Add a book"
          onSelect={() => setAddingBook(true)}
        />
      </PageChrome>

      {/* State, never the page's own name: how much the school owns, how much
          of it is somewhere else, and how much of that is late. */}
      <PageBand
        chips={[
          { label: "Copies", value: copies.toLocaleString() },
          { label: "On the shelf", value: onShelf.toLocaleString() },
          { label: "Out", value: allLoans.length, tone: "brand" },
          {
            label: "Late",
            value: overdue.length,
            tone: overdue.length > 0 ? "danger" : "success",
          },
        ]}
      />

      {libraryQuery.error ? (
        <LoadError
          what="the library"
          error={libraryQuery.error}
          onRetry={() => void libraryQuery.refetch()}
        />
      ) : null}
      {deskMutation.error ? (
        <SaveError what="That book" error={deskMutation.error} />
      ) : null}
      {withdrawMutation.error ? (
        <SaveError what="That title" error={withdrawMutation.error} />
      ) : null}
      {note ? (
        <Alert tone="success" title="Done" onDismiss={() => setNote(null)}>
          {note}
        </Alert>
      ) : null}

      <TableControls
        tabs={<LibraryViews shelves={allBooks.length} out={allLoans.length} />}
        search={
          <TableSearch
            label="Find a book"
            placeholder="Title, author or ISBN"
            value={search}
            onChange={setSearch}
          />
        }
        filters={
          <>
            <FilterSelect
              label="Shelf"
              allLabel="Every shelf"
              value={shelfFilter}
              options={shelves}
              onChange={setShelfFilter}
            />
            <FilterSelect
              label="Genre"
              allLabel="Every genre"
              value={genreFilter}
              options={genres}
              onChange={setGenreFilter}
            />
            <FilterSelect
              label="Copies"
              allLabel="Every copy"
              value={copyFilter}
              options={[
                { value: "in", label: "Something on the shelf" },
                { value: "out", label: "Something out" },
              ]}
              onChange={setCopyFilter}
            />
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        {books.length.toLocaleString()} title{books.length === 1 ? "" : "s"} ·{" "}
        {onShelf.toLocaleString()} cop{onShelf === 1 ? "y" : "ies"} on the shelf
      </p>

      {libraryQuery.isLoading ? (
        <TableRowsSkeleton columns={[{ twoLine: true }, { width: 120 }]} rows={6} />
      ) : books.length === 0 ? (
        allBooks.length === 0 ? (
          <NothingYet
            title="Nothing is catalogued yet"
            body="A title and its accession numbers go in together — a title with no copies is an entry nobody can borrow."
            action={
              <CreateButton
                resource="schools.academics"
                label="Add a book"
                onSelect={() => setAddingBook(true)}
              />
            }
          />
        ) : (
          <NothingMatched
            what="books"
            filters={[shelfFilter, genreFilter, search.trim()].filter(Boolean)}
            onClear={
              anyFilter
                ? () => {
                    setShelfFilter("");
                    setGenreFilter("");
                    setCopyFilter("");
                    setSearch("");
                  }
                : undefined
            }
          />
        )
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {books.map((book) => {
              const isOpen = openBook === book.id;
              return (
                <li key={book.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpenBook(isOpen ? null : book.id);
                      setLendingCopy(null);
                    }}
                    className={[
                      "flex w-full flex-col gap-2 rounded-[var(--radius-md)] border p-2 text-left",
                      isOpen
                        ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]"
                        : "border-transparent hover:bg-[color:var(--surface-muted)]",
                    ].join(" ")}
                  >
                    <BookCover title={book.title} author={book.author} size="sm" />
                    <span className="block truncate text-[length:var(--type-caption)] font-medium text-[color:var(--text-strong)]">
                      {book.title}
                    </span>
                    <span className="block truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                      {shelfLine(book)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {openBook
            ? books
                .filter((book) => book.id === openBook)
                .map((book) => (
                  <div
                    key={book.id}
                    className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)]"
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-3 py-2">
                      <span className="font-medium text-[color:var(--text-strong)]">
                        {bookLabel(book)}
                      </span>
                      <span className="ml-auto">
                        <RecordActions
                          resource="schools.academics"
                          verbs={[
                            {
                              label: "Edit",
                              action: "edit",
                              onSelect: () => setEditingBook(book),
                            },
                            {
                              label: "Withdraw",
                              action: "archive",
                              tone: "danger",
                              loading: withdrawMutation.isPending,
                              unavailable: book.copies.some(
                                (copy) => copy.loans.length > 0,
                              )
                                ? "A copy is still out. Take it back first."
                                : undefined,
                              confirm: {
                                title: `Withdraw ${book.title}`,
                                description: `All ${book.copies.length} cop${book.copies.length === 1 ? "y comes" : "ies come"} off the shelf and the title stops being lendable. The loan history stays, so the school can still answer who had it last.`,
                                confirmLabel: "Withdraw it",
                              },
                              onSelect: () => withdrawMutation.mutate(book.id),
                            },
                          ]}
                        />
                      </span>
                    </div>
                    <ul className="divide-y divide-[color:var(--border-subtle)]">
                      {book.copies.map((copy) => {
                        const loan = copy.loans[0] ?? null;
                        const verbs: RecordVerb[] = loan
                          ? [
                              {
                                label: "Take it back",
                                action: "edit",
                                loading: desk,
                                onSelect: () =>
                                  deskMutation.mutate({
                                    action: "return",
                                    loanId: loan.id,
                                  }),
                              },
                            ]
                          : [
                              {
                                label: "Lend it",
                                action: "edit",
                                onSelect: () => {
                                  setLendingCopy(copy.id);
                                  setReader("");
                                },
                              },
                            ];
                        return (
                          <li key={copy.id} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)]">
                                {copy.copyCode}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                                {loan
                                  ? `${loan.student.lastName}, ${loan.student.firstName} · back by ${loan.dueAt.slice(0, 10)}`
                                  : (book.shelfMark ?? "On the shelf")}
                              </span>
                              <Badge tone={loan ? "brand" : "success"}>
                                {loan ? "Out" : "In"}
                              </Badge>
                              <RecordActions
                                resource="schools.academics"
                                verbs={verbs}
                              />
                            </div>

                            {lendingCopy === copy.id ? (
                              <div className="mt-2 flex flex-wrap items-end gap-2">
                                <FilterSelect
                                  label="Reader"
                                  allLabel="Choose a reader"
                                  value={reader}
                                  options={(readersQuery.data?.data ?? []).map(
                                    (student) => ({
                                      value: student.id,
                                      label: `${student.lastName}, ${student.firstName} · ${student.studentNo}`,
                                    }),
                                  )}
                                  onChange={setReader}
                                />
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={!reader || desk}
                                  loading={desk}
                                  onClick={() =>
                                    deskMutation.mutate({
                                      action: "issue",
                                      copyId: copy.id,
                                      studentId: reader,
                                    })
                                  }
                                >
                                  Issue it
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setLendingCopy(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
            : null}
        </>
      )}

      <BookDialog
        open={addingBook || editingBook !== null}
        book={editingBook}
        onClose={() => {
          setAddingBook(false);
          setEditingBook(null);
        }}
      />
    </div>
  );
}

type BookDraft = {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  category: string;
  shelfMark: string;
  copyCodes: string;
};

const EMPTY_BOOK: BookDraft = {
  title: "",
  author: "",
  isbn: "",
  publisher: "",
  category: "",
  shelfMark: "",
  copyCodes: "",
};

function splitCodes(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter(Boolean);
}

/**
 * Cataloguing a title, and correcting one.
 *
 * The accession numbers go in with the title on the way in, because a title
 * with no copies is a catalogue entry nobody can borrow. On the way back in
 * they are additions only — a donation of four more paperbacks — since removing
 * a copy is withdrawing it, and that keeps its loan history.
 */
function BookDialog({
  open,
  book,
  onClose,
}: {
  open: boolean;
  book: Book | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BookDraft>(EMPTY_BOOK);
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setDraft(
      book
        ? {
            title: book.title,
            author: book.author ?? "",
            isbn: book.isbn ?? "",
            publisher: book.publisher ?? "",
            category: book.category ?? "",
            shelfMark: book.shelfMark ?? "",
            copyCodes: "",
          }
        : EMPTY_BOOK,
    );
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: draft.title.trim(),
        author: draft.author.trim() || null,
        isbn: draft.isbn.trim() || null,
        publisher: draft.publisher.trim() || null,
        category: draft.category.trim() || null,
        shelfMark: draft.shelfMark.trim() || null,
      };
      const codes = splitCodes(draft.copyCodes);
      return book
        ? fetchJson(`/api/v2/schools/library/${book.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              ...body,
              ...(codes.length > 0 ? { addCopyCodes: codes } : {}),
            }),
          })
        : fetchJson("/api/v2/schools/library", {
            method: "POST",
            body: JSON.stringify({ ...body, copyCodes: codes }),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "library"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  const codes = splitCodes(draft.copyCodes);
  const canSave = Boolean(draft.title.trim()) && (book !== null || codes.length > 0);

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={book ? book.title : "Add a book"}
      description="The title, where it lives on the shelf, and the accession number of every copy."
      size="lg"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending && canSave) save.mutate();
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
            disabled={!canSave}
          >
            {book ? "Save the book" : "Add it to the catalogue"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="book-title">Title</Label>
          <Input
            id="book-title"
            required
            value={draft.title}
            placeholder="Things Fall Apart"
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-author">Author</Label>
          <Input
            id="book-author"
            value={draft.author}
            placeholder="Chinua Achebe"
            onChange={(event) =>
              setDraft((current) => ({ ...current, author: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-publisher">Publisher</Label>
          <Input
            id="book-publisher"
            value={draft.publisher}
            onChange={(event) =>
              setDraft((current) => ({ ...current, publisher: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-isbn">ISBN</Label>
          <Input
            id="book-isbn"
            value={draft.isbn}
            onChange={(event) =>
              setDraft((current) => ({ ...current, isbn: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-genre">Genre</Label>
          <Input
            id="book-genre"
            value={draft.category}
            placeholder="African fiction"
            onChange={(event) =>
              setDraft((current) => ({ ...current, category: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-shelf">Shelf mark</Label>
          <Input
            id="book-shelf"
            value={draft.shelfMark}
            placeholder="AFR 823.9"
            onChange={(event) =>
              setDraft((current) => ({ ...current, shelfMark: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="book-copies">
            {book ? "New accession numbers" : "Accession numbers"}
          </Label>
          <Input
            id="book-copies"
            value={draft.copyCodes}
            placeholder="TFA-004, TFA-007, TFA-009"
            onChange={(event) =>
              setDraft((current) => ({ ...current, copyCodes: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            {book
              ? `${codes.length} cop${codes.length === 1 ? "y" : "ies"} will be added. Leave blank to change only the details.`
              : "One per physical copy, separated by commas. A title with no copies is an entry nobody can borrow."}
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}
