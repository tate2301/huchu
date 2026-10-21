"use client";

import { useState, useTransition } from "react";
import type { Vertical, WorkspaceProduct } from "@prisma/client";
import { Button, Callout, Input } from "@corelithzw/react";

import { formatMoney } from "@/lib/admin/format";
import type { SetUpInput } from "@/lib/admin/set-up";
import { ArrowRight } from "@/lib/icons";
import { VERTICAL_ORDER, VERTICAL_RATE, VERTICALS, verticalCharge } from "@/lib/platform/verticals";

function slugOf(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function Choice({ name, checked, onChange, title, help }: { name: string; checked: boolean; onChange: () => void; title: string; help?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1" />
      <span>
        <span className="block text-sm font-medium text-[var(--ink)]">{title}</span>
        {help ? <span className="block text-[13px] text-[var(--text-muted)]">{help}</span> : null}
      </span>
    </label>
  );
}

function Tick({ checked, onChange, title }: { checked: boolean; onChange: (checked: boolean) => void; title: string }) {
  return (
    <label className="flex h-10 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 shadow-[inset_0_0_0_1px_var(--line)] has-[:checked]:bg-[var(--sel-bg)] has-[:checked]:shadow-[inset_0_0_0_1px_var(--sel-line)]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="text-sm font-medium text-[var(--ink)]">{title}</span>
    </label>
  );
}

/** What the chosen verticals cost, at both rates. */
function PriceLine({ verticals }: { verticals: number }) {
  if (verticals === 0) return <p className="t-body-sm text-[var(--text-muted)]">Choose at least one. Each is charged.</p>;
  const included = VERTICAL_RATE.includedMembers;
  return (
    <p className="t-body-sm text-[var(--text-muted)]">
      Pays <span className="font-mono tabular-nums text-[var(--ink)]">{formatMoney(verticalCharge(verticals, 1).total)}</span> a month with up to{" "}
      {included} members, and <span className="font-mono tabular-nums text-[var(--ink)]">{formatMoney(verticalCharge(verticals, included + 1).total)}</span>{" "}
      once it has more.
    </p>
  );
}

/**
 * Setting up a workspace: who it is for, what it runs (and so what it pays),
 * and whether it starts on a trial. One page, top to bottom, because an
 * operator does it with the customer on the phone.
 */
export function SetUpForm({
  root,
  setUp,
}: {
  root: string | null;
  setUp: (input: SetUpInput) => Promise<{ error: string }>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [product, setProduct] = useState<WorkspaceProduct>("CORELITH");
  const [verticals, setVerticals] = useState<Vertical[]>(["GENERAL"]);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [start, setStart] = useState<"TRIAL" | "PAID">("TRIAL");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const address = slugTouched ? slug : slugOf(name);

  return (
    <form
      className="max-w-2xl space-y-8 pb-12"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const outcome = await setUp({ name, slug: address, product, verticals, ownerName, ownerEmail, start });
          if (outcome?.error) setError(outcome.error);
        });
      }}
    >
      <section className="space-y-3">
        <h2 className="t-section text-[var(--ink)]">The business</h2>
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input
          label="Address"
          value={address}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugOf(event.target.value));
          }}
          className="font-mono"
          hint={root ? `Members sign in at ${address || "…"}.${root}. It cannot change once they use it.` : "Members sign in at this address."}
          required
        />
      </section>

      <section className="space-y-3">
        <h2 className="t-section text-[var(--ink)]">What it runs</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="product" checked={product === "CORELITH"} onChange={() => setProduct("CORELITH")} title="Corelith" help="Operations, set up for the kind of business." />
          <Choice name="product" checked={product === "FLARE"} onChange={() => setProduct("FLARE")} title="Flare" help="Sales and follow-ups." />
          <Choice name="product" checked={product === "TENDER"} onChange={() => setProduct("TENDER")} title="Tender" help="The shop and its tills." />
          <Choice name="product" checked={product === "PABASA"} onChange={() => setProduct("PABASA")} title="Pabasa" help="Clients, quotes and jobs." />
        </div>
        {product === "CORELITH" ? (
          <fieldset className="space-y-2">
            <legend className="t-label pb-1.5 text-[var(--ink)]">Verticals, one or more</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {VERTICAL_ORDER.map((vertical) => (
                <Tick
                  key={vertical}
                  title={VERTICALS[vertical].label}
                  checked={verticals.includes(vertical)}
                  onChange={(on) => setVerticals((current) => (on ? [...current, vertical] : current.filter((held) => held !== vertical)))}
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        <PriceLine verticals={product === "CORELITH" ? verticals.length : 1} />
      </section>

      <section className="space-y-3">
        <h2 className="t-section text-[var(--ink)]">How it starts</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="start" checked={start === "TRIAL"} onChange={() => setStart("TRIAL")} title="Start on a 14-day trial" help="They pay when it ends." />
          <Choice name="start" checked={start === "PAID"} onChange={() => setStart("PAID")} title="Start paid" help="They have paid, or are paying now. Record it under Billing." />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="t-section text-[var(--ink)]">The owner</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required />
          <Input label="Email" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required hint="They sign in with a code sent here." />
        </div>
      </section>

      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
      <Button type="submit" variant="primary" size="lg" loading={pending} disabled={product === "CORELITH" && verticals.length === 0} endIcon={<ArrowRight />}>
        Set up {name.trim() || "the workspace"}
      </Button>
    </form>
  );
}
