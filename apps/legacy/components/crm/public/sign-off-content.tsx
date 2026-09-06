"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ClientDate } from "@corelithzw/ui/components/client-date";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Job = {
  reference: string;
  title: string;
  description: string | null;
  completedAt: string | null;
  where: string | null;
  customerName: string | null;
  items: string[];
  signedOffAt: string | null;
  signedOffName: string | null;
};

/**
 * "Is this job finished?", asked of the only person whose answer settles it.
 *
 * Read on a phone by somebody who is not a user of this system and never will
 * be, so: what was done, where, and one box. The rating is optional and says
 * so — asking for stars before accepting the work makes the accepting feel
 * like a review, and people who are unhappy just close the page.
 */
export function SignOffContent({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["public-sign-off", token],
    queryFn: () => fetchJson<{ data: Job }>(`/api/public/crm/sign-off/${token}`),
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () =>
      fetchJson<{ data: Job }>(`/api/public/crm/sign-off/${token}`, {
        method: "POST",
        body: JSON.stringify({ name, rating, notes: notes.trim() || null }),
      }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["public-sign-off", token] });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  if (query.isLoading) {
    return <p className="p-6 text-sm text-neutral-500">Loading the job…</p>;
  }

  if (query.error || !query.data?.data) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">This link isn&apos;t live</h1>
        <p className="mt-1 text-sm text-neutral-600">
          It may have been withdrawn or already answered. Ask whoever sent it for a new one.
        </p>
      </div>
    );
  }

  const job = query.data.data;

  return (
    <div className="mx-auto max-w-md space-y-5 p-6">
      <header className="space-y-1">
        <p className="font-mono text-sm text-neutral-500">{job.reference}</p>
        <h1 className="text-xl font-semibold">{job.title}</h1>
        {job.where ? <p className="text-sm text-neutral-600">{job.where}</p> : null}
      </header>

      {job.items.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-neutral-500">What was done</h2>
          <ul className="mt-1 space-y-1">
            {job.items.map((item) => (
              <li key={item} className="text-base">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {job.signedOffAt ? (
        <section className="rounded-[var(--radius-md)] border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-900">Signed off. Thank you.</p>
          <p className="mt-1 text-sm text-green-800">
            {job.signedOffName} · <ClientDate value={job.signedOffAt} mode="datetime" />
          </p>
        </section>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length < 2) {
              setError("Please put your name in so we know who signed.");
              return;
            }
            submit.mutate();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="signoff-name" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="signoff-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-base"
              autoComplete="name"
            />
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">
              How did it go? <span className="text-neutral-500">(optional)</span>
            </legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={rating === value}
                  onClick={() => setRating(rating === value ? null : value)}
                  className={
                    rating === value
                      ? "size-11 rounded-[var(--radius-md)] border-2 border-neutral-900 text-base font-semibold"
                      : "size-11 rounded-[var(--radius-md)] border border-neutral-300 text-base"
                  }
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="signoff-notes" className="text-sm font-medium">
              Anything to add? <span className="text-neutral-500">(optional)</span>
            </label>
            <textarea
              id="signoff-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 text-base"
            />
          </div>

          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={submit.isPending}
            className="w-full rounded-[var(--radius-md)] bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {submit.isPending ? "Sending…" : "Confirm the work is done"}
          </button>
        </form>
      )}
    </div>
  );
}
