"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@corelithzw/ui/components/command";
import { ResponsivePopover } from "@corelithzw/ui/components/responsive-popover";
import { CheckIcon, ChevronDown } from "@corelithzw/ui/lib/icons";
import {
  fetchSchoolsClasses,
  fetchSchoolsStudents,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import {
  fetchSchoolFeeInvoices,
  fetchSchoolFeeStructures,
  type SchoolFeeInvoiceRecord,
} from "@/lib/schools/fees-v2";

/**
 * The pickers that replaced the four boxes labelled "Student ID", "Term ID" and
 * "Invoice ID".
 *
 * Four fee dialogs asked a bursar to type a UUID. Not choose one — type it,
 * from a list that exists nowhere on the screen, into a plain text input that
 * validated nothing until the server rejected the whole form. There is no
 * workflow in which a person knows `9f2c1a…` for the child in front of them, so
 * in practice those dialogs could not be used at all.
 *
 * `components/ui/searchable-select` is the repo's picker and it filters the
 * options it was handed. That is the wrong shape here for one reason:
 * `getPaginationParams` caps every list endpoint at 100 rows, and a secondary
 * school has 842 pupils. A picker that filters 100 of 842 client-side is a
 * picker that cannot find two thirds of the school — so the query goes to the
 * server, and this is the same popover-over-Command composition with the search
 * box wired up rather than swallowed.
 */

type PickerOption = {
  value: string;
  label: string;
  description?: string;
};

/**
 * The shell: a labelled trigger, a search box, and whatever the caller's query
 * returned for what was typed.
 *
 * `shouldFilter={false}` on the Command, because the narrowing already happened
 * on the server and filtering the result again would drop rows whose match was
 * on a field the label does not show.
 */
function RemotePicker({
  id,
  label,
  required,
  placeholder,
  searchPlaceholder,
  hint,
  value,
  selectedLabel,
  options,
  loading,
  emptyText,
  query,
  onQueryChange,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  required?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  hint?: string;
  value: string;
  /** What to show on the closed trigger when the chosen row is off the page. */
  selectedLabel?: string;
  options: PickerOption[];
  loading: boolean;
  emptyText: string;
  query: string;
  onQueryChange: (next: string) => void;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((option) => option.value === value);
  const shown = active?.label ?? selectedLabel ?? null;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? <span className="text-[color:var(--tone-danger)]"> *</span> : null}
      </label>
      <ResponsivePopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onQueryChange("");
        }}
        title={label}
        className="w-[var(--radix-popover-trigger-width)] p-0"
        trigger={
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span
              className={
                shown
                  ? "truncate text-[var(--text-strong)]"
                  : "truncate text-[var(--text-subtle)]"
              }
            >
              {shown ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </Button>
        }
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={onQueryChange}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            {options.length === 0 ? (
              <CommandEmpty>{loading ? "Looking…" : emptyText}</CommandEmpty>
            ) : (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onMouseDown={(event) => event.preventDefault()}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                      onQueryChange("");
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[var(--text-strong)] [font:var(--type-label-sm)]">
                        {option.label}
                      </div>
                      {option.description ? (
                        <div className="truncate text-[var(--text-muted)] [font:var(--type-caption)]">
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                    {value === option.value ? (
                      <CheckIcon className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </ResponsivePopover>
      {hint ? (
        <p className="mt-1 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A pupil, by name or by student number.
 *
 * `Mutasa, Tanaka — CHS-1219 — Form 2A`: surname first because that is how a
 * bursar's own register is ordered, and the class on the line because two
 * children share a name often enough that it matters.
 */
export function StudentPicker({
  id = "picker-student",
  label = "Pupil",
  value,
  onChange,
  classId,
  required,
  hint,
  disabled,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  classId?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "picker", query, classId ?? ""],
    queryFn: () =>
      fetchSchoolsStudents({
        page: 1,
        limit: 50,
        search: query || undefined,
        classId: classId || undefined,
      }),
  });

  const options = useMemo<PickerOption[]>(
    () =>
      (studentsQuery.data?.data ?? []).map((student) => ({
        value: student.id,
        label: `${student.lastName}, ${student.firstName}`,
        description: [
          student.studentNo,
          student.currentClass?.name,
          student.currentStream?.name,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [studentsQuery.data],
  );

  return (
    <RemotePicker
      id={id}
      label={label}
      required={required}
      hint={hint}
      placeholder="Choose a pupil"
      searchPlaceholder="Name or student number"
      value={value}
      options={options}
      loading={studentsQuery.isFetching}
      emptyText="No pupil matched that."
      query={query}
      onQueryChange={setQuery}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** A term, with the dates it covers so "Term 2" is not ambiguous across years. */
export function TermPicker({
  id = "picker-term",
  label = "Term",
  value,
  onChange,
  required,
  hint,
  disabled,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "picker"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });

  const options = useMemo<PickerOption[]>(() => {
    const normalised = query.trim().toLowerCase();
    // A school has a handful of terms, not hundreds, so this one narrows in the
    // browser — the endpoint would return the same page either way.
    return (termsQuery.data?.data ?? [])
      .filter(
        (term) =>
          !normalised ||
          term.name.toLowerCase().includes(normalised) ||
          term.code.toLowerCase().includes(normalised) ||
          term.academicYear.name.toLowerCase().includes(normalised),
      )
      .map((term) => ({
        value: term.id,
        label: term.name,
        description: `${formatSchoolDate(term.startDate)} to ${formatSchoolDate(term.endDate)}`,
      }));
  }, [termsQuery.data, query]);

  return (
    <RemotePicker
      id={id}
      label={label}
      required={required}
      hint={hint}
      placeholder="Choose a term"
      searchPlaceholder="Term or year"
      value={value}
      options={options}
      loading={termsQuery.isFetching}
      emptyText="No term matched that."
      query={query}
      onQueryChange={setQuery}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/**
 * A bill, by number or by the pupil it is for.
 *
 * The description carries the outstanding balance, because the question the
 * bursar is actually answering — which bill does this money settle — is decided
 * by what is still owed on it rather than by the number.
 */
export function InvoicePicker({
  id = "picker-invoice",
  label = "Invoice",
  value,
  onChange,
  studentId,
  status,
  required,
  hint,
  disabled,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Narrows to one pupil's bills — what the allocate and receipt dialogs want. */
  studentId?: string;
  status?: SchoolFeeInvoiceRecord["status"];
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const invoicesQuery = useQuery({
    queryKey: ["schools", "fees", "invoices", "picker", query, studentId ?? "", status ?? ""],
    queryFn: () =>
      fetchSchoolFeeInvoices({
        page: 1,
        limit: 50,
        search: query || undefined,
        studentId: studentId || undefined,
        status,
      }),
  });

  const options = useMemo<PickerOption[]>(
    () =>
      (invoicesQuery.data?.data ?? []).map((invoice) => ({
        value: invoice.id,
        label: invoice.invoiceNo,
        description: `${invoice.student.lastName}, ${invoice.student.firstName} · ${invoice.term.name} · ${formatSchoolMoney(invoice.balanceAmount, invoice.currency)} outstanding`,
      })),
    [invoicesQuery.data],
  );

  return (
    <RemotePicker
      id={id}
      label={label}
      required={required}
      hint={hint}
      placeholder="Choose an invoice"
      searchPlaceholder="Invoice number or pupil"
      value={value}
      options={options}
      loading={invoicesQuery.isFetching}
      emptyText="No invoice matched that."
      query={query}
      onQueryChange={setQuery}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** A year group, for the one form that has to say which ladder rung it prices. */
export function ClassPicker({
  id = "picker-class",
  label = "Year group",
  value,
  onChange,
  required,
  hint,
  disabled,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });

  const options = useMemo<PickerOption[]>(() => {
    const normalised = query.trim().toLowerCase();
    // A ladder is a dozen rungs; narrowing it in the browser costs nothing.
    return (classesQuery.data?.data ?? [])
      .filter(
        (row) =>
          !normalised ||
          row.name.toLowerCase().includes(normalised) ||
          row.code.toLowerCase().includes(normalised),
      )
      .map((row) => ({
        value: row.id,
        label: row.name,
        description: `${row._count.students} pupils`,
      }));
  }, [classesQuery.data, query]);

  return (
    <RemotePicker
      id={id}
      label={label}
      required={required}
      hint={hint}
      placeholder="Choose a year group"
      searchPlaceholder="Year group"
      value={value}
      options={options}
      loading={classesQuery.isFetching}
      emptyText="No year group matched that."
      query={query}
      onQueryChange={setQuery}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** A fee sheet, with its year group, its line count and what it charges. */
export function FeeStructurePicker({
  id = "picker-structure",
  label = "Fee structure",
  value,
  onChange,
  termId,
  classId,
  required,
  hint,
  disabled,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  termId?: string;
  classId?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const structuresQuery = useQuery({
    queryKey: ["schools", "fees", "structures", "picker", query, termId ?? "", classId ?? ""],
    queryFn: () =>
      fetchSchoolFeeStructures({
        page: 1,
        limit: 50,
        search: query || undefined,
        termId: termId || undefined,
        classId: classId || undefined,
        status: "ACTIVE",
        includeLines: true,
      }),
  });

  const options = useMemo<PickerOption[]>(
    () =>
      (structuresQuery.data?.data ?? []).map((structure) => ({
        value: structure.id,
        label: structure.name,
        description: `${structure.class.name} · ${structure._count.lines} lines · ${formatSchoolMoney(structure.totals?.amount ?? 0, structure.currency)}`,
      })),
    [structuresQuery.data],
  );

  return (
    <RemotePicker
      id={id}
      label={label}
      required={required}
      hint={hint}
      placeholder="Choose a fee sheet"
      searchPlaceholder="Sheet, year group or term"
      value={value}
      options={options}
      loading={structuresQuery.isFetching}
      emptyText="No active fee sheet matched that."
      query={query}
      onQueryChange={setQuery}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
