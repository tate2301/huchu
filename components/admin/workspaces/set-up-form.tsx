"use client";

import { useState, useTransition } from "react";
import type { WorkspaceProduct } from "@prisma/client";
import { Button, Callout, Input } from "@corelithzw/react";

import { formatMoney } from "@/lib/admin/format";
import { ArrowRight } from "@/lib/icons";

type Template = { code: string; label: string; tier: string };
type Tier = { code: string; name: string; monthlyPrice: number };

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

/**
 * Setting up a workspace: who it is for, what it runs, what it pays, and
 * whether it starts on a trial. One page, top to bottom, because an operator
 * does it with the customer on the phone.
 */
export function SetUpForm({
  root,
  templates,
  tiers,
  setUp,
}: {
  root: string | null;
  templates: Template[];
  tiers: Tier[];
  setUp: (input: {
    name: string;
    slug: string;
    product: WorkspaceProduct;
    templateCode: string;
    tierCode: string;
    ownerName: string;
    ownerEmail: string;
    start: "TRIAL" | "PAID";
  }) => Promise<{ error: string }>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [product, setProduct] = useState<WorkspaceProduct>("CORELITH");
  const [templateCode, setTemplateCode] = useState(templates[0]?.code ?? "");
  const [tierCode, setTierCode] = useState(templates[0]?.tier ?? tiers[0]?.code ?? "");
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
          const outcome = await setUp({ name, slug: address, product, templateCode, tierCode, ownerName, ownerEmail, start });
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
        </div>
        {product === "CORELITH" ? (
          <div className="space-y-1.5">
            {templates.map((template) => (
              <Choice
                key={template.code}
                name="template"
                checked={templateCode === template.code}
                onChange={() => {
                  setTemplateCode(template.code);
                  setTierCode(template.tier);
                }}
                title={template.label}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="t-section text-[var(--ink)]">Plan</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {tiers.map((tier) => (
            <Choice key={tier.code} name="tier" checked={tierCode === tier.code} onChange={() => setTierCode(tier.code)} title={tier.name} help={`${formatMoney(tier.monthlyPrice)} a month`} />
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="start" checked={start === "TRIAL"} onChange={() => setStart("TRIAL")} title="Start on a 14-day trial" help="They pay when it ends." />
          <Choice name="start" checked={start === "PAID"} onChange={() => setStart("PAID")} title="Start paid" help="They have paid, or are paying now. Record it under Plan and billing." />
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
      <Button type="submit" variant="primary" size="lg" loading={pending} endIcon={<ArrowRight />}>
        Set up {name.trim() || "the workspace"}
      </Button>
    </form>
  );
}
