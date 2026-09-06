"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionType, AutomationAction } from "@/lib/crm/automation";
import type { AutomationField } from "@/lib/crm/automation-fields";

/**
 * The controls a workflow step is built out of.
 *
 * Shared between the sequence editor and anything else that needs to render a
 * condition or an action: what a value looks like depends entirely on the
 * field it belongs to, and getting that wrong is how you save a rule that
 * reads correctly and never matches a single record.
 */
export type Owner = { id: string; name: string | null };

export function defaultAction(type: ActionType): AutomationAction {
  switch (type) {
    case "CREATE_TASK":
      return { type: "CREATE_TASK", title: "Follow up", dueInDays: 1 };
    case "ASSIGN_OWNER":
      return { type: "ASSIGN_OWNER", assignedToId: null };
    case "NOTIFY":
      return { type: "NOTIFY", recipientIds: [], message: "Take a look at this" };
    case "ADD_TAG":
      return { type: "ADD_TAG", tag: "" };
    case "SET_FIELD":
      return { type: "SET_FIELD", field: "probability", value: 50 };
  }
}

/** A picker over a fixed list — the shape every typed option in here wants. */
export function OptionSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The value side of a condition, or of a "set a field" action.
 *
 * Which control this is depends entirely on the field that was picked: a
 * stage gets the stage list, an owner gets the team, a number gets a number
 * box. It used to be a text input for all of them, which is how you end up
 * with a rule testing `stage equals "Quoted"` that saves cleanly and never
 * matches a single record.
 */
export function FieldValueInput({
  field,
  value,
  onChange,
  owners,
  className,
}: {
  field: AutomationField | undefined;
  value: string | number | boolean | null | undefined;
  onChange: (value: string | number) => void;
  owners: Owner[];
  className?: string;
}) {
  const asText = value === null || value === undefined ? "" : String(value);

  if (field?.kind === "enum" && field.options) {
    return (
      <OptionSelect
        className={className}
        value={asText}
        onValueChange={onChange}
        options={field.options}
        placeholder="Pick one"
        ariaLabel={`${field.label} value`}
      />
    );
  }

  if (field?.kind === "user") {
    return (
      <OptionSelect
        className={className}
        value={asText}
        onValueChange={onChange}
        options={owners.map((owner) => ({
          value: owner.id,
          label: owner.name ?? "Unnamed",
        }))}
        placeholder="Pick someone"
        ariaLabel={`${field.label} value`}
      />
    );
  }

  if (field?.kind === "number") {
    return (
      <Input
        className={className}
        type="number"
        value={asText}
        placeholder="0"
        aria-label={`${field.label} value`}
        // Kept as a number so the rule compares like with like — a numeric
        // field tested against the string "5000" is a rule that never fires.
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    );
  }

  if (field?.kind === "date") {
    return (
      <Input
        className={className}
        type="date"
        value={asText.slice(0, 10)}
        aria-label={`${field.label} value`}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      className={className}
      value={asText}
      placeholder="value"
      aria-label={field ? `${field.label} value` : "Value"}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
