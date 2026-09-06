"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type ClaimInvite = {
  subject: "STUDENT" | "GUARDIAN";
  sentTo: string;
  displayName: string;
  reference: string;
  expiresAt: string;
  minPasswordLength: number;
};

type ClaimResult = {
  email: string;
  subject: "STUDENT" | "GUARDIAN";
  signInPath: string;
};

/**
 * Setting up a portal account from an invitation.
 *
 * One column at every width — this arrives as a WhatsApp link and is opened on
 * a phone, and a form with one decision in it has no second column to fill.
 *
 * The canvas (design/campus/spec/ClaimAccount.html) draws two panels, and both
 * are here: "The invite, unclaimed" is the form, and "Already claimed, or
 * expired" is the state a second tap on the same link lands in. That second
 * one matters more than it looks. The link works once, so the commonest way to
 * arrive is a parent tapping the WhatsApp message twice — and a dead end that
 * only says the link is broken sends them back to the office for a new one
 * they do not need. It offers the two ways out instead: sign in, or ask.
 *
 * The school is not named anywhere on this page, and that is the endpoint's
 * decision rather than an omission — `findClaimableInvite` selects who the
 * invite is for and nothing else about the school, so an unauthenticated
 * caller holding a guessed token learns nothing from it. The canvas draws the
 * school's name in both panels; it is left out here rather than invented.
 */
export function ClaimPortalAccountContent({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [howToAsk, setHowToAsk] = useState(false);

  const inviteQuery = useQuery({
    queryKey: ["portal-claim", token],
    queryFn: () =>
      fetchJson<{ data: ClaimInvite }>(`/api/public/schools/claim/${token}`).then(
        (response) => response.data,
      ),
    retry: false,
  });

  const claim = useMutation({
    mutationFn: () =>
      fetchJson<{ data: ClaimResult }>(`/api/public/schools/claim/${token}`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }).then((response) => response.data),
  });

  const invite = inviteQuery.data;
  const minLength = invite?.minPasswordLength ?? 10;
  const tooShort = password.length > 0 && password.length < minLength;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const canSubmit =
    password.length >= minLength && confirmPassword === password && !claim.isPending;

  if (inviteQuery.isLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-4">
        <p className="text-muted-foreground">Opening your invitation…</p>
      </main>
    );
  }

  /*
    Every reason a link stops working — used, expired, withdrawn, never valid —
    reads the same from here, because the endpoint deliberately refuses to sort
    guessed tokens into "wrong" and "used". The commonest of them by far is a
    second tap on the same WhatsApp message, so the screen leads with that and
    offers the way through it.
  */
  if (inviteQuery.error || !invite) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-4">
        <div className="space-y-2 text-center">
          <h1 className="text-section-title">
            This invite has already been used
          </h1>
          <p className="text-muted-foreground">
            The link the school sent works once, and this one has been claimed.
            If it was you, sign in with the password you chose. If it was not,
            tell the school office.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
          {/*
            There is no support route to send them to, and no school contact on
            this page to link — the endpoint gives out nothing about the school
            to an unauthenticated caller. So this says how, rather than
            pretending to be a door: the office is reached back down the channel
            the invite arrived on.
          */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setHowToAsk((open) => !open)}
            aria-expanded={howToAsk}
            aria-controls="claim-how-to-ask"
          >
            Ask the office for a new link
          </Button>
        </div>

        {howToAsk ? (
          <p
            id="claim-how-to-ask"
            className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
          >
            Reply to the message the school sent this link on, or ring the
            office and ask them to send another. They can issue a fresh
            invitation from your child&rsquo;s record; the old link stays dead.
          </p>
        ) : null}
      </main>
    );
  }

  if (claim.isSuccess) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-4">
        <div className="space-y-2">
          <h1 className="text-section-title">Your account is ready</h1>
          <p className="text-muted-foreground">
            Sign in with {claim.data.email} and the password you just chose.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={claim.data.signInPath}>Sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4">
      <div className="space-y-2">
        <h1 className="text-section-title">Set up your portal account</h1>
        <p className="text-muted-foreground">
          The school has invited you to follow <b>{invite.displayName}</b>
          {invite.reference ? ` · ${invite.reference}` : ""}. Choose a password
          and the portal is yours.
        </p>
      </div>

      {claim.error ? (
        <Alert variant="destructive">
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{getApiErrorMessage(claim.error)}</AlertDescription>
        </Alert>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) claim.mutate();
        }}
      >
        {/*
          The address is shown and not asked for. The invite was sent to it, so
          it is the one thing on this form nobody may change — somebody who
          typed a different address here would claim an account the school
          could not then reach them at.
        */}
        <div className="space-y-2">
          <Label htmlFor="claim-email">Email</Label>
          <Input id="claim-email" value={invite.sentTo} readOnly disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="claim-password">Choose a password</Label>
          <Input
            id="claim-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className={tooShort ? "text-destructive" : "text-muted-foreground"}>
            At least {minLength} characters. You will use this every time.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="claim-confirm">Type it again</Label>
          <Input
            id="claim-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {mismatch ? (
            <p className="text-destructive">Those two do not match.</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" disabled={!canSubmit}>
          {claim.isPending ? "Setting up…" : "Open my portal"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        This link was sent to you by the school office and works once. If it has
        stopped working, ask the office to send another.
      </p>
    </main>
  );
}
