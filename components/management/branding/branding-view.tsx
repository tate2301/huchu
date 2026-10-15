"use client";

/* eslint-disable @next/next/no-img-element -- a brand image is whatever address the workspace gave; next/image would need every host in the config. */
import * as React from "react";

import { Button, ButtonLink, Finding, Icon, Input, Segmented, Select, TextArea } from "@/components/core";
import { KitPage } from "@/components/management/ui";
import {
  BRANDING_TABS,
  DATE_FORMATS,
  DOMAIN_LABEL,
  LANGUAGES,
  MONEY_FORMATS,
  NUMBER_FORMATS,
  TIME_FORMATS,
  fileNameOf,
  normalizeHex,
  withCurrent,
  type BrandingField,
  type BrandingForm,
  type BrandingResponse,
  type BrandingTab,
  type DomainVerb,
  type Finding as FindingText,
  type Option,
  type PaymentAccount,
  type QuotePreview as Preview,
} from "@/lib/branding/form";

import styles from "./branding.module.css";
import { byPosition } from "./pay-accounts-drawer";
import { QuotePreview } from "./quote-preview";

/* ---------------------------------------------------------------------- *
 * Rows
 * ---------------------------------------------------------------------- */

/** One row of a section: what it is (and a line under it), then its control. */
function Row({
  label,
  sub,
  htmlFor,
  children,
  note,
}: {
  label: string;
  sub?: string;
  htmlFor?: string;
  children: React.ReactNode;
  /** A line under the control: the DNS record still to add. */
  note?: React.ReactNode;
}) {
  return (
    <div className={`srow ${styles.row}`}>
      <label className={styles.what} htmlFor={htmlFor}>
        <b>{label}</b>
        {sub ? <span>{sub}</span> : null}
      </label>
      <span className={styles.control}>{children}</span>
      {note ? <div className={styles.note}>{note}</div> : null}
    </div>
  );
}

/** A section: its title and one line on the left, its rows on the right. */
function Set({ title, aside, children }: { title: string; aside: string; children: React.ReactNode }) {
  return (
    <section className={`lset ${styles.set}`}>
      <div>
        <h2>{title}</h2>
        <p className="aside">{aside}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

type FieldProps = {
  form: BrandingForm;
  set: (field: BrandingField, value: string) => void;
  id: (field: string) => string;
};

/** A text row: the label, the input, nothing else. */
function TextRow({
  field,
  label,
  sub,
  form,
  set,
  id,
  numeric,
  type = "text",
  placeholder,
  long,
}: FieldProps & { field: BrandingField; label: string; sub?: string; numeric?: boolean; type?: string; placeholder?: string; long?: boolean }) {
  // An <input> strips line breaks; a value that already has one keeps its box.
  const multi = long || form[field].includes("\n");
  return (
    <Row label={label} sub={sub} htmlFor={id(field)}>
      {multi ? (
        <TextArea id={id(field)} rows={2} value={form[field]} onChange={(event) => set(field, event.target.value)} />
      ) : (
        <Input
          id={id(field)}
          type={type}
          className={numeric ? styles.num : undefined}
          placeholder={placeholder}
          value={form[field]}
          onChange={(event) => set(field, event.target.value)}
        />
      )}
    </Row>
  );
}

function SelectRow({
  field,
  label,
  options,
  form,
  set,
  id,
  placeholder = "Not set",
}: FieldProps & { field: BrandingField; label: string; options: Option[]; placeholder?: string }) {
  return (
    <Row label={label} htmlFor={id(field)}>
      <Select id={id(field)} value={form[field]} onChange={(event) => set(field, event.target.value)}>
        <option value="">{placeholder}</option>
        {withCurrent(options, form[field]).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Row>
  );
}

function ColourRow({ field, label, sub, form, set, id }: FieldProps & { field: BrandingField; label: string; sub: string }) {
  const swatch = normalizeHex(form[field]) ?? "#000000";
  return (
    <Row label={label} sub={sub} htmlFor={id(field)}>
      <input
        type="color"
        className={styles.swatch}
        aria-label={`Pick the ${label.toLowerCase()} colour`}
        value={swatch.toLowerCase()}
        onChange={(event) => set(field, event.target.value.toUpperCase())}
      />
      <Input
        id={id(field)}
        className={styles.num}
        spellCheck={false}
        value={form[field]}
        aria-invalid={normalizeHex(form[field]) ? undefined : true}
        onChange={(event) => set(field, event.target.value)}
        onBlur={(event) => {
          const next = normalizeHex(event.target.value);
          if (next && next !== form[field]) set(field, next);
        }}
      />
    </Row>
  );
}

/**
 * A brand image: its tile, the file it is, Replace or Add, and Remove.
 * `CompanyBranding` keeps an address, not a file (there is no upload context
 * for branding), so Replace edits the address in place.
 */
function ImageRow({
  field,
  label,
  sub,
  placeholder,
  form,
  set,
  id,
}: FieldProps & { field: BrandingField; label: string; sub?: string; placeholder: React.ReactNode }) {
  const value = form[field].trim();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [size, setSize] = React.useState<string | null>(null);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) set(field, draft.trim());
  };
  return (
    <Row label={label} sub={sub} htmlFor={id(field)}>
      <span className={styles.tile}>
        {value ? (
          <img
            src={value}
            alt=""
            onLoad={(event) => setSize(`${event.currentTarget.naturalWidth} × ${event.currentTarget.naturalHeight}`)}
            onError={() => setSize(null)}
          />
        ) : (
          placeholder
        )}
      </span>
      {editing ? (
        <Input
          id={id(field)}
          autoFocus
          aria-label={`${label} address`}
          placeholder="https://"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          id={id(field)}
          className={`selbox ${styles.file} ${styles.pick}`}
          title={value || undefined}
          aria-label={value ? `Replace the ${label.toLowerCase()}, ${fileNameOf(value)}` : `Add the ${label.toLowerCase()}`}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          <span className={value ? undefined : styles.empty}>
            {value ? [fileNameOf(value), size].filter(Boolean).join(", ") : "Add an image"}
          </span>
          <Icon name="upload" />
        </button>
      )}
      {value && !editing ? (
        <Button size="sm" variant="quiet" iconOnly icon="x" label={`Remove the ${label.toLowerCase()}`} onClick={() => set(field, "")} />
      ) : null}
    </Row>
  );
}

/* ---------------------------------------------------------------------- *
 * The page
 * ---------------------------------------------------------------------- */

export type BrandingViewProps = {
  tab: BrandingTab;
  onTab: (tab: BrandingTab) => void;
  data: BrandingResponse;
  form: BrandingForm;
  set: (field: BrandingField, value: string) => void;
  finding: FindingText;
  preview: Preview;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** A refresh that failed while the form was already on screen. */
  problem: string | null;
  domain: {
    typed: string;
    onType: (value: string) => void;
    verb: DomainVerb;
    busy: boolean;
    onSave: () => void;
    onCheck: () => void;
  };
  accounts: { list: PaymentAccount[]; onOpen: () => void };
};

/** Branding (PageBrandIdentity, PageBrandAssets, PageBrandFinance). Pure: the page feeds it. */
export function BrandingView(props: BrandingViewProps) {
  const { tab, form, set, data } = props;
  const uid = React.useId();
  const id = (field: string) => `${uid}-${field}`;
  const fields: FieldProps = { form, set, id };
  const name = form.displayName.trim() || data.company.name;

  const saved = data.domain;
  const live = saved && (saved.status === "ACTIVE" || saved.status === "VERIFIED");
  const shownAccounts = props.accounts.list.filter((account) => account.showOnDocuments).sort(byPosition);

  return (
    <KitPage
      title="Branding"
      mark={<Icon name="brand" />}
      flush
      actions={
        <>
          {props.dirty ? (
            <Button variant="quiet" disabled={props.saving} onClick={props.onDiscard}>
              Discard changes
            </Button>
          ) : null}
          <Button variant="primary" icon="done" shortcut="Ctrl S" busy={props.saving} disabled={!props.dirty || props.saving} onClick={props.onSave}>
            Save
          </Button>
        </>
      }
    >
      <div className={styles.split}>
        <div className="kbody">
          <div className={`ws-tools ${styles.tools}`}>
            <Segmented label="Branding" items={BRANDING_TABS.map(({ value, label }) => ({ value, label }))} value={tab} onChange={props.onTab} />
            <div className="end">
              <ButtonLink variant="quiet" size="sm" icon="eye" href="/preferences/organization/branding/where">
                Where it shows
              </ButtonLink>
            </div>
          </div>
          <Finding fact={props.finding.fact} rest={props.finding.rest} />
          {props.problem ? (
            <p className={`muted ${styles.problem}`} role="alert">
              {props.problem}
            </p>
          ) : null}
          <div className={styles.sections}>
            {tab === "identity" ? (
              <>
                <Set title="Name and colours" aside="Shown on documents, emails and the portal.">
                  <TextRow field="displayName" label="Display name" placeholder={data.company.name} {...fields} />
                  <ColourRow field="primaryColor" label="Primary" sub="Headings and totals" {...fields} />
                  <ColourRow field="secondaryColor" label="Secondary" sub="Body text on documents" {...fields} />
                  <ColourRow field="accentColor" label="Accent" sub="Highlights and charts" {...fields} />
                  <Row label="Font" htmlFor={id("fontFamilyKey")}>
                    <Select id={id("fontFamilyKey")} value={form.fontFamilyKey} onChange={(event) => set("fontFamilyKey", event.target.value)}>
                      {data.fontOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Row>
                  <Row
                    label="Custom domain"
                    sub="Where people sign in"
                    htmlFor={id("domain")}
                    note={
                      saved && !live && props.domain.verb !== "save" ? (
                        <>
                          <span>
                            Add a {saved.verificationType} record at <code>{saved.verificationHost}</code>
                          </span>
                          <span>
                            with the value <code>{saved.verificationValue}</code>
                          </span>
                        </>
                      ) : !data.effective.customDomainEnabled ? (
                        <span>A custom domain comes with the custom domain add-on, in Billing.</span>
                      ) : null
                    }
                  >
                    <Input
                      id={id("domain")}
                      placeholder="portal.example.com"
                      disabled={!data.effective.customDomainEnabled}
                      value={props.domain.typed}
                      onChange={(event) => props.domain.onType(event.target.value)}
                    />
                    {props.domain.verb === "save" ? (
                      <Button size="sm" busy={props.domain.busy} disabled={props.domain.busy} onClick={props.domain.onSave}>
                        Save the domain
                      </Button>
                    ) : props.domain.verb === "check" ? (
                      <Button size="sm" icon="history" busy={props.domain.busy} disabled={props.domain.busy} onClick={props.domain.onCheck}>
                        Check DNS
                      </Button>
                    ) : null}
                    {saved && props.domain.verb !== "save" ? (
                      live ? (
                        <span className="ok-dot">{DOMAIN_LABEL[saved.status]}</span>
                      ) : (
                        <span className="muted">{DOMAIN_LABEL[saved.status]}</span>
                      )
                    ) : null}
                  </Row>
                </Set>
                <Set title="Legal details" aside="Printed in the footer of every document.">
                  <TextRow field="legalName" label="Legal name" {...fields} />
                  <TextRow field="tradingName" label="Trading name" {...fields} />
                  <TextRow field="registrationNumber" label="Registration number" numeric {...fields} />
                  <TextRow field="taxNumber" label="Tax number" numeric {...fields} />
                  <TextRow field="vatNumber" label="VAT number" numeric {...fields} />
                </Set>
              </>
            ) : null}

            {tab === "assets" ? (
              <>
                <Set title="Images" aside="PNG or SVG. A wide logo prints best.">
                  <ImageRow field="logoUrl" label="Logo" placeholder={<span style={{ color: props.preview.primary }}>{name}</span>} {...fields} />
                  <ImageRow
                    field="secondaryLogoUrl"
                    label="Secondary logo"
                    sub="For small spaces"
                    placeholder={<span>{props.preview.initials}</span>}
                    {...fields}
                  />
                  <ImageRow field="signatureUrl" label="Signature" placeholder={<Icon name="signature" />} {...fields} />
                  <ImageRow field="stampUrl" label="Stamp" placeholder={<Icon name="done" />} {...fields} />
                </Set>
                <Set title="Contact" aside={`How customers and staff reach ${name}.`}>
                  <TextRow field="email" label="Email" type="email" {...fields} />
                  <TextRow field="phone" label="Phone" numeric {...fields} />
                  <TextRow field="website" label="Website" {...fields} />
                  <TextRow field="physicalAddress" label="Physical address" {...fields} />
                  <TextRow field="postalAddress" label="Postal address" {...fields} />
                </Set>
              </>
            ) : null}

            {tab === "finance" ? (
              <>
                <Set title="Bank details" aside="Printed under the totals.">
                  <TextRow field="bankName" label="Bank" {...fields} />
                  <Row label="Branch and code" htmlFor={id("bankBranch")}>
                    <span className={styles.pair}>
                      <Input id={id("bankBranch")} value={form.bankBranch} onChange={(event) => set("bankBranch", event.target.value)} />
                      <Input
                        aria-label="Branch code"
                        className={styles.num}
                        value={form.bankBranchCode}
                        onChange={(event) => set("bankBranchCode", event.target.value)}
                      />
                    </span>
                  </Row>
                  <TextRow field="bankAccountName" label="Account name" {...fields} />
                  <TextRow field="bankAccountNumber" label="Account number" numeric {...fields} />
                  <TextRow field="bankSwiftCode" label="SWIFT" numeric {...fields} />
                  <TextRow field="bankIban" label="IBAN" numeric {...fields} />
                  <TextRow field="bankAddress" label="Bank address" {...fields} />
                  <Row label="Other ways to pay" htmlFor={id("accounts")}>
                    <button type="button" id={id("accounts")} className={`selbox ${styles.pick}`} onClick={props.accounts.onOpen}>
                      <span className={`truncate${shownAccounts.length ? "" : ` ${styles.empty}`}`}>
                        {shownAccounts.length ? shownAccounts.map((account) => account.name).join(" · ") : "None printed yet"}
                      </span>
                      <Icon name="chev" />
                    </button>
                  </Row>
                </Set>
                <Set title="Document defaults" aside="Used unless a template says otherwise.">
                  <TextRow field="paymentTerms" label="Payment terms" placeholder="Payment within 14 days" {...fields} />
                  <TextRow field="defaultFooterText" label="Footer line" {...fields} />
                  <TextRow field="legalDisclaimer" label="Disclaimer" long {...fields} />
                  <TextRow field="privacyPolicyUrl" label="Privacy policy" type="url" placeholder="https://" {...fields} />
                  <TextRow field="termsUrl" label="Terms and conditions" type="url" placeholder="https://" {...fields} />
                </Set>
                <Set title="Formats" aside="How dates, times and money are written.">
                  <SelectRow field="dateFormat" label="Date" options={DATE_FORMATS} {...fields} />
                  <SelectRow field="timeFormat" label="Time" options={TIME_FORMATS} {...fields} />
                  <SelectRow field="numberFormat" label="Numbers" options={NUMBER_FORMATS} {...fields} />
                  <SelectRow field="currencyDisplayMode" label="Money" options={MONEY_FORMATS} {...fields} />
                  <SelectRow field="documentLocale" label="Language" options={LANGUAGES} {...fields} />
                </Set>
              </>
            ) : null}
          </div>
        </div>
        <QuotePreview preview={props.preview} show={tab} />
      </div>
    </KitPage>
  );
}
