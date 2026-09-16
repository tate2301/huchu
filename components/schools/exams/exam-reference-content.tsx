"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { LoadError, NothingYet, SaveError, TableRowsSkeleton } from "@/components/records/states";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { RecordDialog } from "@/components/crm/records/record-dialog";
// The dialog footer uses the design-system button, which is the one that has an
// `outline` variant; the band action above uses the Corelith primary.
import { Button as DialogButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  EXAM_LEVEL_LABELS,
  createExamReference,
  fetchExamReference,
  type ExamLevel,
} from "@/lib/schools/exams-v2";

/**
 * Who this school sits exams with.
 *
 * ## Why this screen had to exist
 *
 * `POST /api/v2/schools/exams/reference` shipped and had no caller anywhere in
 * the product, so a school could not create an exam board. A series needs a
 * board; candidates need a series; entries, the timetable, seating and results
 * all need candidates. The whole exams module was unreachable from an empty
 * tenant, and the New series dialog opened with an empty board picker and no
 * explanation.
 *
 * ## Three lists, and the order matters
 *
 * A **board** is ZIMSEC or Cambridge. A **centre number** is what that board
 * calls this school — `025419` to ZIMSEC, and a different number to Cambridge,
 * because a centre number belongs to one board and means nothing to another. A
 * **syllabus subject** is the board's code for a subject at a level: `4008`
 * Mathematics at O-Level, `9164` Pure Mathematics at A-Level.
 *
 * Centres and subjects both hang off a board, so the board list leads and both
 * of the others ask which board first.
 */

type View = "boards" | "centres" | "subjects";

export function ExamReferenceContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("boards");
  const [dialog, setDialog] = useState<View | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const referenceQuery = useQuery({
    queryKey: ["schools", "exams", "reference"],
    queryFn: fetchExamReference,
  });

  const boards = referenceQuery.data?.boards ?? [];
  const centres = referenceQuery.data?.centres ?? [];
  const subjects = referenceQuery.data?.subjects ?? [];
  const boardName = (id: string) => boards.find((board) => board.id === id)?.name ?? "—";

  return (
    <SchoolsPage>
      <PageChrome title="Exam boards and syllabuses" backHref="/schools/exams" backLabel="Exam series">
        <Button
          variant="primary"
          onClick={() => setDialog(view)}
          // Both of the others need a board to hang off, so there is nothing
          // useful to offer until one exists.
          disabled={view !== "boards" && boards.length === 0}
        >
          {view === "boards" ? "New board" : view === "centres" ? "New centre number" : "New subject"}
        </Button>
      </PageChrome>

      {saveError ? <SaveError what="The entry" error={saveError} /> : null}

      <VerticalDataViews
        items={[
          {
            id: "boards",
            label: "Exam boards",
            count: referenceQuery.isPending ? undefined : boards.length,
          },
          {
            id: "centres",
            label: "Centre numbers",
            count: referenceQuery.isPending ? undefined : centres.length,
          },
          {
            id: "subjects",
            label: "Syllabus subjects",
            count: referenceQuery.isPending ? undefined : subjects.length,
          },
        ]}
        value={view}
        onValueChange={(value) => setView(value as View)}
        railLabel="Exam reference"
      >
        {referenceQuery.error ? (
          <LoadError
            what="the exam reference"
            error={referenceQuery.error}
            onRetry={() => void referenceQuery.refetch()}
          />
        ) : referenceQuery.isPending ? (
          <TableRowsSkeleton
            rows={6}
            headers={["Code", "Name", "Board"]}
            columns={[{ width: 120 }, {}, { width: 180 }]}
          />
        ) : view === "boards" ? (
          boards.length === 0 ? (
            <NothingYet
              title="No exam board yet"
              body="ZIMSEC, or Cambridge. Everything in this module hangs off a board: a series is sat with one, and a centre number and a syllabus code both belong to one."
              action={
                <Button variant="primary" onClick={() => setDialog("boards")}>
                  New board
                </Button>
              }
            />
          ) : (
            <SimpleTable
              headers={["Code", "Name"]}
              rows={boards.map((board) => [board.code, board.name])}
            />
          )
        ) : view === "centres" ? (
          centres.length === 0 ? (
            <NothingYet
              title="No centre number yet"
              body="What the board calls this school — 025419 to ZIMSEC. It goes on the entry file, so the board knows whose candidates these are."
              action={
                boards.length > 0 ? (
                  <Button variant="primary" onClick={() => setDialog("centres")}>
                    New centre number
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <SimpleTable
              headers={["Number", "Board"]}
              rows={centres.map((centre) => [centre.number, boardName(centre.boardId)])}
            />
          )
        ) : subjects.length === 0 ? (
          <NothingYet
            title="No syllabus subjects yet"
            body="The board's code for a subject at a level — 4008 Mathematics at O-Level. Entries and the timetable are both written against these."
            action={
              boards.length > 0 ? (
                <Button variant="primary" onClick={() => setDialog("subjects")}>
                  New subject
                </Button>
              ) : undefined
            }
          />
        ) : (
          <SimpleTable
            headers={["Code", "Name", "Level", "Board"]}
            rows={subjects.map((subject) => [
              subject.code,
              subject.name,
              EXAM_LEVEL_LABELS[subject.level],
              boardName(subject.boardId),
            ])}
          />
        )}
      </VerticalDataViews>

      <ExamReferenceDialog
        // Fresh fields each open: a school types a run of syllabus codes in one
        // sitting, and a dialog that kept the last one would file this subject
        // under the previous one's code.
        key={dialog ?? "closed"}
        kind={dialog}
        boards={boards}
        onOpenChange={(open) => setDialog(open ? dialog : null)}
        onSaved={() => {
          setSaveError(null);
          void queryClient.invalidateQueries({ queryKey: ["schools", "exams", "reference"] });
          setDialog(null);
        }}
        onError={(error) => setSaveError(getApiErrorMessage(error))}
      />
    </SchoolsPage>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[color:var(--border-subtle)] text-left text-xs text-[color:var(--text-muted)]">
          {headers.map((header, index) => (
            <th key={header} className={index === 0 ? "w-[140px] py-1.5 font-normal" : "py-1.5 font-normal"}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.join("|")} className="border-b border-[color:var(--border-subtle)]">
            {row.map((cell, index) => (
              <td
                key={index}
                className={index === 0 ? "py-2 font-mono text-xs" : "py-2"}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExamReferenceDialog({
  kind,
  boards,
  onOpenChange,
  onSaved,
  onError,
}: {
  kind: View | null;
  boards: Array<{ id: string; code: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onError: (error: unknown) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [level, setLevel] = useState<ExamLevel>("O_LEVEL");

  const title =
    kind === "boards"
      ? "New exam board"
      : kind === "centres"
        ? "New centre number"
        : "New syllabus subject";

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (kind === "boards") {
        await createExamReference({
          kind: "board",
          code: code.trim().toUpperCase(),
          name: name.trim(),
        });
        return;
      }
      if (kind === "centres") {
        await createExamReference({
          kind: "centre",
          boardId,
          number: code.trim(),
          name: name.trim() || null,
        });
        return;
      }
      await createExamReference({
        kind: "subject",
        boardId,
        code: code.trim(),
        name: name.trim(),
        level,
      });
    },
    onSuccess: () => onSaved(),
    onError: (error) => onError(error),
  });

  const needsBoard = kind === "centres" || kind === "subjects";
  const ready =
    code.trim() !== "" &&
    (kind === "centres" || name.trim() !== "") &&
    (!needsBoard || boardId !== "");

  const codeLabel = kind === "centres" ? "Centre number" : "Code";
  const codePlaceholder =
    kind === "boards" ? "ZIMSEC" : kind === "centres" ? "025419" : "4008";

  return (
    <RecordDialog
      open={kind !== null}
      onOpenChange={onOpenChange}
      title={title}
      description={
        kind === "boards"
          ? "The board this school sits exams with. A series, a centre number and a syllabus code all belong to one."
          : kind === "centres"
            ? "What this board calls this school. It goes on the entry file."
            : "The board's code for a subject at a level."
      }
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogButton
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </DialogButton>
          <DialogButton
            type="button"
            disabled={!ready || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Adding…" : "Add it"}
          </DialogButton>
        </div>
      }
    >
      <div className="space-y-3">
        {needsBoard ? (
          <div className="space-y-1.5">
            <Label htmlFor="ref-board">Board</Label>
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger id="ref-board">
                <SelectValue placeholder="Pick a board" />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="ref-code">{codeLabel}</Label>
          <Input
            id="ref-code"
            value={code}
            placeholder={codePlaceholder}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>

        {kind !== "centres" ? (
          <div className="space-y-1.5">
            <Label htmlFor="ref-name">Name</Label>
            <Input
              id="ref-name"
              value={name}
              placeholder={kind === "boards" ? "ZIMSEC" : "Mathematics"}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        ) : null}

        {kind === "subjects" ? (
          <div className="space-y-1.5">
            <Label htmlFor="ref-level">Level</Label>
            <Select value={level} onValueChange={(value) => setLevel(value as ExamLevel)}>
              <SelectTrigger id="ref-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EXAM_LEVEL_LABELS) as ExamLevel[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {EXAM_LEVEL_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </RecordDialog>
  );
}
