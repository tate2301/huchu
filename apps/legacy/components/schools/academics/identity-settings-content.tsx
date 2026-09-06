"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, SegmentedControl, Skeleton, Switch } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

/**
 * S-10.x — the school's identity, written down.
 *
 * Three decisions live here, all the head's rather than any one clerk's:
 * what a student number looks like, what the pupil ID card looks like, and
 * the reminder that record pictures are an administrator's act.
 *
 * The number format defaults to "keep doing what the books already do" —
 * `inferNumbering` — and declaring a format is the office overriding that
 * inference out loud. The preview shows the next number under the current
 * answer *before* saving, because the consequence of this form is permanent:
 * a child keeps their number for their whole school life.
 */

type IdentitySettings = {
  studentPrefix: string | null;
  studentSeparator: string | null;
  studentPadWidth: number | null;
  cardAccentColor: string;
  cardMotto: string | null;
  cardShowPhoto: boolean;
  cardShowGuardianPhone: boolean;
};

type IdentityResponse = {
  settings: IdentitySettings | null;
  preview: { nextStudentNo: string; inferredScheme: string; studentsOnBooks: number };
};

type FormState = {
  declared: boolean;
  prefix: string;
  separator: "" | "-" | "/";
  padWidth: string;
  cardAccentColor: string;
  cardMotto: string;
  cardShowPhoto: boolean;
  cardShowGuardianPhone: boolean;
};

const EMPTY: FormState = {
  declared: false,
  prefix: "",
  separator: "-",
  padWidth: "4",
  cardAccentColor: "#1D4ED8",
  cardMotto: "",
  cardShowPhoto: true,
  cardShowGuardianPhone: true,
};

function toForm(data: IdentityResponse): FormState {
  const s = data.settings;
  return {
    declared: s?.studentPrefix != null,
    prefix: s?.studentPrefix ?? "",
    separator: (s?.studentSeparator ?? "-") as FormState["separator"],
    padWidth: String(s?.studentPadWidth ?? 4),
    cardAccentColor: s?.cardAccentColor ?? "#1D4ED8",
    cardMotto: s?.cardMotto ?? "",
    cardShowPhoto: s?.cardShowPhoto ?? true,
    cardShowGuardianPhone: s?.cardShowGuardianPhone ?? true,
  };
}

export function IdentitySettingsContent() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saved, setSaved] = useState(false);

  const role = (session?.user as { role?: string } | undefined)?.role?.toUpperCase() ?? "";
  // Mirrors `isSchoolAdmin` server-side; the server remains the authority.
  const isAdmin = role === "SUPERADMIN" || role === "MANAGER" || role === "SCHOOL_ADMIN";

  const query = useQuery({
    queryKey: ["schools", "settings", "identity"],
    queryFn: () => fetchJson<IdentityResponse>("/api/v2/schools/settings/identity"),
  });

  /*
   * Adopt the saved settings during render, keyed on the object the query
   * handed back. An effect ran after the first paint, so the form showed its
   * empty defaults for a frame — and an administrator who typed immediately had
   * their first keystrokes overwritten when the fetch landed.
   */
  const [adopted, setAdopted] = useState<IdentityResponse | null>(null);
  if (query.data && query.data !== adopted) {
    setAdopted(query.data);
    setForm(toForm(query.data));
  }

  const save = useMutation({
    mutationFn: () =>
      fetchJson<IdentityResponse>("/api/v2/schools/settings/identity", {
        method: "PUT",
        body: JSON.stringify({
          studentPrefix: form.declared ? form.prefix.trim() || null : null,
          studentSeparator: form.declared ? form.separator : null,
          studentPadWidth: form.declared ? Number(form.padWidth) : null,
          cardAccentColor: form.cardAccentColor,
          cardMotto: form.cardMotto.trim() || null,
          cardShowPhoto: form.cardShowPhoto,
          cardShowGuardianPhone: form.cardShowGuardianPhone,
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["schools", "settings", "identity"], data);
      setSaved(true);
    },
  });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert tone="danger" title="Identity settings would not load">
        {getApiErrorMessage(query.error)}
      </Alert>
    );
  }

  const preview = query.data?.preview;
  // What the next pupil would be called under the form as it stands, so the
  // office reads the consequence before pressing save.
  const liveNext = form.declared
    ? `${form.prefix.trim() || "?"}${form.separator}${String(
        Number(preview?.nextStudentNo.replace(/\D/g, "") ?? 1),
      ).padStart(Number(form.padWidth) || 0, "0")}`
    : preview?.nextStudentNo;

  const patch = (next: Partial<FormState>) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, ...next }));
  };

  return (
    <div className="space-y-4">
      {!isAdmin ? (
        <Alert tone="info" title="Read-only for your role">
          Only a school administrator can change identity settings.
        </Alert>
      ) : null}
      {save.isError ? (
        <Alert tone="danger" title="The settings did not save">
          {getApiErrorMessage(save.error)}
        </Alert>
      ) : null}
      {saved ? <Alert tone="success" title="Identity settings saved" /> : null}

      <Card
        title="Student numbers"
        subtitle={
          preview
            ? `${preview.studentsOnBooks} pupils on the books · current scheme ${preview.inferredScheme}`
            : undefined
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Declare a format</p>
              <p className="text-sm text-[color:var(--text-muted)]">
                Off, the register keeps its own scheme: new pupils continue the numbering the
                school arrived with. On, every new number follows the format below.
              </p>
            </div>
            <Switch
              checked={form.declared}
              onChange={(event) => patch({ declared: event.target.checked })}
              disabled={!isAdmin}
              aria-label="Declare a student number format"
            />
          </div>

          {form.declared ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="id-prefix">Prefix</Label>
                <Input
                  id="id-prefix"
                  value={form.prefix}
                  onChange={(event) =>
                    patch({ prefix: event.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() })
                  }
                  placeholder="CHS"
                  maxLength={10}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Separator</Label>
                <SegmentedControl
                  options={[
                    { value: "none", label: "None" },
                    { value: "-", label: "Dash" },
                    { value: "/", label: "Slash" },
                  ]}
                  value={form.separator === "" ? "none" : form.separator}
                  onValueChange={(value) =>
                    patch({ separator: (value === "none" ? "" : value) as FormState["separator"] })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="id-pad">Digits</Label>
                <Input
                  id="id-pad"
                  type="number"
                  min={0}
                  max={8}
                  value={form.padWidth}
                  onChange={(event) => patch({ padWidth: event.target.value })}
                  disabled={!isAdmin}
                />
              </div>
            </div>
          ) : null}

          <p className="text-sm">
            Next pupil admitted gets{" "}
            <span className="font-[family-name:var(--font-mono)] font-semibold">{liveNext}</span>
          </p>
        </div>
      </Card>

      <Card
        title="Pupil ID card"
        subtitle="What a child carries in their pocket. Printed per pupil from their record page."
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="card-accent">Card colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="card-accent"
                    type="color"
                    value={form.cardAccentColor}
                    onChange={(event) => patch({ cardAccentColor: event.target.value })}
                    disabled={!isAdmin}
                    className="h-9 w-14 cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-transparent p-1"
                    aria-label="ID card accent colour"
                  />
                  <span className="font-[family-name:var(--font-mono)] text-sm text-[color:var(--text-muted)]">
                    {form.cardAccentColor.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-motto">Motto line</Label>
                <Input
                  id="card-motto"
                  value={form.cardMotto}
                  onChange={(event) => patch({ cardMotto: event.target.value })}
                  placeholder="Doctrina lumen vitae"
                  maxLength={120}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm">Show the pupil&apos;s photograph</p>
              <Switch
                checked={form.cardShowPhoto}
                onChange={(event) => patch({ cardShowPhoto: event.target.checked })}
                disabled={!isAdmin}
                aria-label="Show the pupil's photograph on the card"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm">Show a guardian&apos;s phone number</p>
                <p className="text-sm text-[color:var(--text-muted)]">
                  So a found card can be returned to the family, not just to the school.
                </p>
              </div>
              <Switch
                checked={form.cardShowGuardianPhone}
                onChange={(event) => patch({ cardShowGuardianPhone: event.target.checked })}
                disabled={!isAdmin}
                aria-label="Show a guardian's phone number on the card"
              />
            </div>
          </div>

          {/* The card itself, CR80 proportions (85.6 × 54). The accent colour is
              printed ink — data, not theme — so it is the one deliberate inline
              colour on this screen. */}
          <div
            className="h-[189px] w-[300px] shrink-0 overflow-hidden rounded-[10px] border border-[color:var(--border)] shadow-sm"
            aria-label="ID card preview"
          >
            <div
              className="flex h-9 items-center justify-between px-3 text-[11px] font-semibold text-white"
              style={{ background: form.cardAccentColor }}
            >
              <span className="truncate">STUDENT IDENTITY CARD</span>
              <span>{new Date().getFullYear()}</span>
            </div>
            <div className="flex gap-3 bg-white p-3 text-neutral-900">
              {form.cardShowPhoto ? (
                <div className="flex h-[84px] w-[68px] shrink-0 items-center justify-center rounded-[4px] border border-neutral-300 bg-neutral-100 text-[10px] text-neutral-500">
                  PHOTO
                </div>
              ) : null}
              <div className="min-w-0 space-y-0.5 text-[11px] leading-tight">
                <p className="text-[13px] font-bold">Tendai Moyo</p>
                <p className="font-[family-name:var(--font-mono)]">{liveNext}</p>
                <p>Form 2 Blue</p>
                {form.cardShowGuardianPhone ? <p>Guardian: 0772 000 111</p> : null}
                {form.cardMotto.trim() ? (
                  <p className="pt-1 italic text-neutral-500">{form.cardMotto}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Record pictures"
        subtitle="Photographs, emojis and colours on students, teachers, guardians, classes, subjects and hostels."
      >
        <p className="text-sm text-[color:var(--text-muted)]">
          Set from each record&apos;s own page. Only school administrators can change them — a
          display image shows on every list every role reads, so it is not any one clerk&apos;s
          call. People carry photographs or initials, never emojis; classes, subjects and
          hostels may carry an emoji.
        </p>
      </Card>

      {isAdmin ? (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save identity settings"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
