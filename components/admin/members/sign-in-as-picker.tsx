"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@corelithzw/react";

import { signInAs, signInAsChoices, type SignInAsChoices } from "@/app/portal/admin/w/[slug]/members/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { SignInAsDialog } from "./sign-in-as-dialog";

/**
 * "Sign in as" from the context bar: first who, from the members with access,
 * then the same reason-and-how-far step the Members page opens.
 */
export function SignInAsPicker({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [choices, setChoices] = useState<SignInAsChoices | null>(null);
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void signInAsChoices(slug).then((answer) => live && setChoices(answer));
    return () => {
      live = false;
    };
  }, [open, slug]);

  const close = () => {
    setMember(null);
    setQuery("");
    setChoices(null);
    onOpenChange(false);
  };

  const shown = useMemo(() => {
    if (!choices?.ok) return [];
    const needle = query.trim().toLowerCase();
    return needle ? choices.members.filter((row) => `${row.name} ${row.roleLabel}`.toLowerCase().includes(needle)) : choices.members;
  }, [choices, query]);

  if (member && choices?.ok) {
    return (
      <SignInAsDialog
        open
        onOpenChange={(next) => !next && close()}
        member={member}
        workspaceName={choices.workspaceName}
        ownerName={choices.ownerName}
        canChange={choices.canChange}
        start={signInAs.bind(null, slug)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in as</DialogTitle>
          <DialogDescription className="not-sr-only t-body-sm text-[var(--text-muted)]">
            {choices?.ok ? `Who in ${choices.workspaceName}? Only members with access are listed.` : "Who?"}
          </DialogDescription>
        </DialogHeader>
        {!choices ? (
          <div role="status" className="flex items-center gap-2 t-body-sm text-[var(--text-muted)]">
            <Spinner label="Loading members" /> Loading members
          </div>
        ) : !choices.ok ? (
          <p role="alert" className="text-sm text-[var(--bad)]">
            {choices.error}
          </p>
        ) : (
          <div className="space-y-3">
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a member"
              aria-label="Find a member"
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] focus:border-[var(--action)] focus:outline-none"
            />
            <ul className="max-h-72 overflow-y-auto rounded-[var(--radius-sm)] shadow-[inset_0_0_0_1px_var(--line)]">
              {shown.length === 0 ? (
                <li className="px-3 py-3 text-sm text-[var(--text-muted)]">
                  {query ? `Nobody matches “${query}”.` : "Nobody here has access to sign in as."}
                </li>
              ) : (
                shown.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setMember({ id: row.id, name: row.name })}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] focus-visible:outline-none"
                    >
                      <span className="font-medium text-[var(--ink)]">{row.name}</span>
                      <span className="text-[13px] text-[var(--text-muted)]">{row.roleLabel}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
