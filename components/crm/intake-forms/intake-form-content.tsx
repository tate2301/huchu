"use client";

import { useState } from "react";

import { SectionAction, SectionHeading } from "@/components/management/ui";
import { QuestionList, ChoiceList } from "@/components/forms/question-list";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
} from "@/app/management/master-data/operations/_components/register-fields";
import { RecordEmpty } from "@/app/management/master-data/schools/classes/record-fields";
import { SAVE_STATE_LABELS, useAutosave } from "@/hooks/use-autosave";
import { fetchJson } from "@/lib/api-client";
import {
  CHOICE_FIELD_TYPES,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  fieldProblems,
  type FieldDefinition,
} from "@/lib/forms/fields";
import { Plus, Storefront, TextT } from "@/lib/icons";

export type ServiceDraft = { id: string; label: string };

/** The words and questions of a form — everything on it a client reads. */
export type IntakeFormContent = {
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  fields: FieldDefinition[];
  services: ServiceDraft[];
};

function bodyOf(content: IntakeFormContent): string {
  return JSON.stringify({
    headline: content.headline?.trim() || null,
    description: content.description?.trim() || null,
    successMessage: content.successMessage?.trim() || null,
    // The editor clears a description or a choice list to null; the form
    // stores an absent one.
    fields: content.fields.map(({ help, options, ...field }) => ({
      ...field,
      ...(help ? { help } : {}),
      ...(options ? { options } : {}),
    })),
    // A service still being typed is not a service yet.
    services: content.services.filter((service) => service.label.trim()),
  });
}

/**
 * An intake form's own content, in a form's record: what it says at the top
 * and after it is sent, the services a client can pick, and its questions.
 *
 * It saves itself as it is typed (`useAutosave`). Mount it keyed on the form.
 */
export function IntakeFormContentSections({
  formId,
  name,
  initial,
  onSaved,
}: {
  formId: string;
  /** What a client sees as the title while there is no headline. */
  name: string;
  initial: IntakeFormContent;
  /** After any write, so what is cached about the form catches up. */
  onSaved: () => void;
}) {
  const [content, setContent] = useState<IntakeFormContent>(initial);
  // The keys stored when the form was opened. A question added since keeps
  // following its wording; one that was already there keeps the key its
  // answers are filed under.
  const [lockedKeys] = useState(() => new Set(initial.fields.map((field) => field.key)));
  const set = (next: Partial<IntakeFormContent>) => setContent((current) => ({ ...current, ...next }));

  const problems = fieldProblems(content.fields);
  const state = useAutosave({
    initialBody: bodyOf(initial),
    body: bodyOf(content),
    valid: problems.length === 0,
    save: async (body, { keepalive }) => {
      await fetchJson(`/api/v2/crm/intake-forms/${formId}`, { method: "PATCH", body, keepalive });
      onSaved();
    },
  });
  const status = SAVE_STATE_LABELS[state];
  const statusNode = status ? <span className="text-[13px] leading-[1.45] text-[#5E6573]">{status}</span> : null;

  return (
    <>
      <SectionHeading icon={TextT} action={statusNode}>
        On the form
      </SectionHeading>
      <DetailGrid className="mb-8">
        <DetailRow label="Headline">
          {(id) => (
            <Input
              id={id}
              value={content.headline ?? ""}
              placeholder={name}
              className={DETAIL_CONTROL_CLASS}
              onChange={(event) => set({ headline: event.target.value })}
            />
          )}
        </DetailRow>
        <DetailRow label="Description">
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={content.description ?? ""}
              placeholder="A line under the headline"
              className="text-[13px] leading-[1.5]"
              onChange={(event) => set({ description: event.target.value })}
            />
          )}
        </DetailRow>
        <DetailRow label="After it is sent">
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={content.successMessage ?? ""}
              placeholder="Thank you."
              className="text-[13px] leading-[1.5]"
              onChange={(event) => set({ successMessage: event.target.value })}
            />
          )}
        </DetailRow>
        <DetailRow label="Always asked">
          <span className="text-[13px] leading-[1.5] text-[#5E6573]">
            Name, email, phone and anything else they want to add
          </span>
        </DetailRow>
      </DetailGrid>

      <SectionHeading
        icon={Storefront}
        count={content.services.length}
        action={
          <SectionAction
            icon={Plus}
            onClick={() =>
              set({ services: [...content.services, { id: `service_${Date.now().toString(36)}`, label: "" }] })
            }
          >
            Add a service
          </SectionAction>
        }
      >
        Services
      </SectionHeading>
      <div className="mb-8 max-w-[470px]">
        {content.services.length === 0 ? (
          <RecordEmpty>None. Add one and clients pick what they are interested in.</RecordEmpty>
        ) : (
          <ChoiceList
            items={content.services.map((service) => ({ value: service.id, label: service.label }))}
            noun="service"
            onChange={(items) => set({ services: items.map((item) => ({ id: item.value, label: item.label })) })}
          />
        )}
      </div>

      <QuestionList<FieldDefinition["type"], FieldDefinition>
        questions={content.fields}
        onChange={(fields) => set({ fields })}
        types={FIELD_TYPES}
        typeLabels={FIELD_TYPE_LABELS}
        choiceTypes={CHOICE_FIELD_TYPES}
        create={(key) => ({ key, label: "", type: "text", required: false })}
        keyLocked={(field) => lockedKeys.has(field.key)}
        problems={problems}
        status={statusNode}
      />
    </>
  );
}
