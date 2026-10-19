"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { BkField, BkFormPage, BkSeg, FormSec, RailFigure, RailSteps, todayHarare } from "@/components/books/bk-form";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Icon, Input, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CLAIM_KINDS, claimFormErrors, claimPayload, voucherPayload, type ClaimForm } from "@/lib/books/claim-form";
import { money } from "@/lib/books/format";
import type { BooksFormOptions } from "@/lib/books/form-options-view";
import { readNumber } from "@/lib/books/invoice-form";
import { uploadBooksFile } from "@/lib/books/upload-client";

type Options = BooksFormOptions & {
  floats: Array<{ id: string; name: string; currency: string; holderId: string | null }>;
  projects: Array<{ id: string; name: string }>;
};

/** The slip: a photo taken with the phone's camera (or a file), shown as it will be kept. */
function SlipPhoto({ file, onFile }: { file: File | null; onFile: (file: File | null) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div style={{ position: "relative", height: 200, borderRadius: 12, background: "var(--color-fill)", overflow: "hidden", display: "grid", placeItems: "center" }}>
      {url ? (
        // A local preview of the photo just taken; next/image has nothing to optimise here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="The slip" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      ) : file ? (
        <span className="muted">{file.name}</span>
      ) : (
        <Button icon="camera" onClick={() => input.current?.click()}>
          Snap the slip
        </Button>
      )}
      {file ? (
        <Button size="sm" icon="camera" style={{ position: "absolute", right: 10, bottom: 10 }} onClick={() => input.current?.click()}>
          Retake
        </Button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        aria-label="The slip, a photo"
        hidden
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function ClaimFormPage({ options, asVoucher }: { options: Options; asVoucher: boolean }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [shown, setShown] = React.useState(false);
  const [form, setForm] = React.useState<ClaimForm>(() => ({
    where: "",
    amount: "",
    vat: "",
    category: "OTHER",
    projectId: "",
    paidWith: asVoucher && options.floats.length ? "float" : "own",
    floatId: options.floats[0]?.id ?? "",
    spentOn: todayHarare(),
  }));
  const set = <K extends keyof ClaimForm>(key: K, value: ClaimForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const errors = shown ? claimFormErrors(form) : {};
  const float = options.floats.find((candidate) => candidate.id === form.floatId);
  const currency = form.paidWith === "float" ? (float?.currency ?? options.base) : options.base;
  const amount = readNumber(form.amount);

  const send = useMutation({
    mutationFn: async () => {
      let receiptUrl: string | null = null;
      let photoError: string | null = null;
      if (photo) {
        try {
          receiptUrl = (await uploadBooksFile(photo)).url;
        } catch (error) {
          photoError = getApiErrorMessage(error, "The slip's photo was not kept.");
        }
      }
      if (form.paidWith === "float") {
        const voucher = await fetchJson<{ voucherNo: string | null; status: string }>("/api/books/petty-cash", { method: "POST", body: JSON.stringify(voucherPayload(form, receiptUrl)) });
        return { kind: "voucher" as const, number: voucher.voucherNo, status: voucher.status, photoError };
      }
      const claim = await fetchJson<{ claimNo: string | null; status: string }>("/api/books/claims", { method: "POST", body: JSON.stringify(claimPayload(form, currency, receiptUrl)) });
      return { kind: "claim" as const, number: claim.claimNo, status: claim.status, photoError };
    },
    onSuccess: async (done) => {
      toast({
        title: done.kind === "claim" ? `${done.number ?? "Your claim"} is sent for approval` : done.status === "POSTED" ? `${done.number ?? "The voucher"} is posted` : "The voucher waits for approval",
        description: done.photoError ?? (done.kind === "claim" ? "You are paid back once it is approved." : `Spent from ${float?.name ?? "the float"}.`),
        variant: done.photoError ? "destructive" : "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push(done.kind === "claim" ? "/books/claims" : "/books/claims?view=vouchers");
    },
    onError: (error) => toast({ title: "It was not sent", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const submit = () => {
    setShown(true);
    if (Object.keys(claimFormErrors(form)).length === 0) send.mutate();
  };

  const paidWith = (
    <BkField label="Paid with">
      <BkSeg
        label="Paid with"
        value={form.paidWith}
        onChange={(value) => set("paidWith", value)}
        options={[
          { value: "own", label: "My own money" },
          { value: "float", label: options.floats.length === 1 ? options.floats[0].name : "A float", disabled: options.floats.length === 0 },
        ]}
      />
    </BkField>
  );

  // Drawn once for a desk and once for a phone (only one shows): each copy's ids its own.
  const fields = (at: string) => (
    <>
      <BkField label="Where" htmlFor={`${at}-where`} error={errors.where}>
        <Input id={`${at}-where`} value={form.where} placeholder="Puma, Msasa" onChange={(event) => set("where", event.target.value)} />
      </BkField>
      <div className="field-row">
        <BkField label="Amount" htmlFor={`${at}-amount`} error={errors.amount}>
          <Input id={`${at}-amount`} className="num" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => set("amount", event.target.value)} />
        </BkField>
        <BkField label="VAT" htmlFor={`${at}-vat`} optional error={errors.vat}>
          <Input id={`${at}-vat`} className="num" inputMode="decimal" placeholder="0.00" value={form.vat} onChange={(event) => set("vat", event.target.value)} />
        </BkField>
      </div>
      <div className="field-row">
        <BkField label="What" htmlFor={`${at}-kind`}>
          <Select id={`${at}-kind`} value={form.category} onChange={(event) => set("category", event.target.value)}>
            {CLAIM_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </BkField>
        <BkField label="For" htmlFor={`${at}-for`} optional>
          <Select id={`${at}-for`} value={form.projectId} onChange={(event) => set("projectId", event.target.value)}>
            <option value="">No job</option>
            {options.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </BkField>
      </div>
      {form.paidWith === "float" && options.floats.length > 1 ? (
        <BkField label="Float" htmlFor={`${at}-float`} error={errors.floatId}>
          <Select id={`${at}-float`} value={form.floatId} onChange={(event) => set("floatId", event.target.value)}>
            {options.floats.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        </BkField>
      ) : null}
    </>
  );

  return (
    <>
      <PageChrome title={asVoucher ? "New voucher" : "New claim"} backHref="/books/claims" backLabel="Claims & petty cash" primary={{ label: form.paidWith === "float" ? "Send the voucher" : "Send the claim", icon: "send", shortcut: "Ctrl ↵", onClick: submit, disabled: send.isPending ? "Sending" : undefined }} />
      <div className="bk-desk-only">
        <BkFormPage
          rail={
            <>
              <RailFigure
                title={form.paidWith === "float" ? "This voucher" : "This claim"}
                figure={money(Number.isFinite(amount) ? amount : 0, currency)}
                rows={[
                  ["VAT", form.vat.trim() ? money(readNumber(form.vat) || 0, currency) : "None"],
                  ["Paid with", form.paidWith === "float" ? (float?.name ?? "A float") : "Your own money"],
                  ["Number", form.paidWith === "float" ? "Given when posted" : options.nextNumber],
                ]}
              />
              <RailSteps
                title="When you send it"
                steps={
                  form.paidWith === "float"
                    ? [
                        ["It is posted", "from the float, or waits"],
                        ["Over the limit", "a manager approves it"],
                        ["The float", "is topped up for it"],
                      ]
                    : [
                        ["It is approved", "by someone else"],
                        ["It is posted", "to its expense"],
                        ["You are paid back", "from a money account"],
                      ]
                }
              />
            </>
          }
        >
          <FormSec title="Slip" text="A photo of it, kept with the claim.">
            <SlipPhoto file={photo} onFile={setPhoto} />
          </FormSec>
          <FormSec title="What was spent" text="As the slip says.">
            {fields("desk")}
          </FormSec>
          <FormSec title="Paid" text="From your pocket, or a float.">
            {paidWith}
          </FormSec>
        </BkFormPage>
      </div>

      {/* At phone width (BkClaimPhone): the slip, what it says, how it was paid; Send at the foot. */}
      <div className="bk-ph-only">
        <div className="bk-ph-b" style={{ gap: 16 }}>
          <SlipPhoto file={photo} onFile={setPhoto} />
          <span style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: "var(--color-muted)" }}>
            <Icon name="check" />
            Check what the slip says, then send it.
          </span>
          {fields("phone")}
          {paidWith}
        </div>
      </div>
      <div className="bk-ph-acts">
        <Button variant="primary" icon="send" shortcut="Ctrl ↵" busy={send.isPending} disabled={send.isPending} onClick={submit}>
          {form.paidWith === "float" ? "Send the voucher" : "Send the claim"}
        </Button>
      </div>
    </>
  );
}

function NewClaim() {
  const params = useSearchParams();
  const options = useQuery({ queryKey: ["books", "forms", "claim"], queryFn: () => fetchJson<Options>("/api/books/forms?for=claim") });
  if (options.data) return <ClaimFormPage options={options.data} asVoucher={params.get("paid") === "float"} />;
  return (
    <>
      <PageChrome title="New claim" backHref="/books/claims" backLabel="Claims & petty cash" />
      {options.isError ? <BooksError what="The claim form" onRetry={() => options.refetch()} /> : <BooksLoading />}
    </>
  );
}

/** Books → Claims & petty cash → New claim: snap a slip (design/core-modules/boards/view/BkClaimPhone.html), a claim or, from a float, a voucher. */
export default function NewClaimPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <NewClaim />
      </React.Suspense>
    </BooksPage>
  );
}
