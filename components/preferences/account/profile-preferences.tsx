"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormField, FormPage, HeaderAction } from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { SignOut, Warning } from "@/lib/icons";
import { USER_ROLE_LABELS } from "@/lib/platform/vertical-roles";
import {
  fetchPreferencesProfile,
  updatePreferencesProfile,
  uploadProfilePhoto,
  type PreferencesProfile,
} from "@/lib/preferences/api";

import { PasswordDialog } from "./password-dialog";
import styles from "./account.module.css";

type ProfileDraft = {
  name: string;
  phone: string;
  /** The photo as it will be saved: a blob url, or null for no photo. */
  image: string | null;
};

function createDraft(profile: PreferencesProfile | undefined): ProfileDraft {
  return {
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    image: profile?.image ?? null,
  };
}

/** The board's date shape: `6 Jan 2026`. */
function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Tendai Marimo" -> "TM". The board draws two letters at most. */
function initialsOf(name: string, fallback: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || fallback.slice(0, 2).toUpperCase();
}

function roleLabel(role: string) {
  return (
    USER_ROLE_LABELS[role as keyof typeof USER_ROLE_LABELS] ??
    role
      .toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/**
 * Profile — `Account.dc.html`.
 *
 * A form page: the identity mark, the three editable details, the workspace
 * facts, then Submit/Cancel above the footer rule. No `Card`, no `SaveBar` and
 * no field descriptions — rule 1 deletes the helper text the old form carried
 * under Phone, Email, Role and Workspace, all four of which were restating
 * their own label.
 *
 * Sign out is the header's one labelled verb (rule 3), and Remove photo is the
 * rare, destructive one behind the `…` — drawn only when there is a photo to
 * remove, per rule 9.
 *
 * The three things this page was missing now have data behind them and are
 * drawn as the board draws them:
 *
 *   - **Change photo.** Two steps, which is how `lib/preferences/api.ts` built
 *     it: `uploadProfilePhoto` puts the file in blob storage and hands back a
 *     url, then Save changes PATCHes that url with the rest of the form. So
 *     picking a photo and walking away leaves an orphaned blob rather than a
 *     changed avatar, and the mark previews the pending one meanwhile.
 *   - **Member since**, from `createdAt`.
 *   - **Password**, from `passwordChangedAt`, with Change opening
 *     `PasswordDialog`. The row's value is empty when the password has never
 *     been changed: `createdAt` is a different claim and borrowing it would
 *     make the row say something untrue.
 */
export function ProfilePreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["preferences", "profile"],
    queryFn: fetchPreferencesProfile,
  });

  const [draft, setDraft] = React.useState<ProfileDraft>(() => createDraft(undefined));
  const [changingPassword, setChangingPassword] = React.useState(false);
  const photoInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (profileQuery.data) {
      setDraft(createDraft(profileQuery.data));
    }
  }, [profileQuery.data]);

  /**
   * Change photo, step one of two: the file goes to blob storage and the url it
   * comes back as goes into the draft. Nothing about the account has changed
   * yet — Save changes is what writes it.
   */
  const photoMutation = useMutation({
    mutationFn: uploadProfilePhoto,
    onSuccess: (uploaded) => {
      setDraft((current) => ({ ...current, image: uploaded.url }));
    },
    onError: (error) => {
      toast({
        title: "Unable to upload that photo",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePreferencesProfile,
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your account preferences were saved.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["preferences", "profile"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update profile",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const signOutAction = (
    <HeaderAction
      icon={SignOut}
      onClick={() => {
        void signOut({ callbackUrl: "/login" });
      }}
    >
      Sign out
    </HeaderAction>
  );

  if (profileQuery.isLoading) {
    return (
      <PreferencesShell>
        <FormPage title="Profile" action={signOutAction} className={styles.page}>
          <div className={styles.skeleton} role="status" aria-label="Loading your profile">
            {[220, 140, 300, 140, 260, 140].map((width, index) => (
              <span
                key={index}
                className={styles.skeletonBar}
                style={{ width: `${width}px` }}
              />
            ))}
          </div>
        </FormPage>
      </PreferencesShell>
    );
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <PreferencesShell>
        <FormPage title="Profile" action={signOutAction} className={styles.page}>
          <p className={styles.failure}>
            <Warning />
            {getApiErrorMessage(profileQuery.error)}
          </p>
        </FormPage>
      </PreferencesShell>
    );
  }

  const profile = profileQuery.data;
  const saved = createDraft(profile);

  return (
    <PreferencesShell>
      <FormPage
        title="Profile"
        action={signOutAction}
        className={styles.page}
        busy={updateMutation.isPending || photoMutation.isPending}
        onCancel={() => setDraft(saved)}
        overflow={
          // Rule 3: the rare, destructive verb lives behind the `…`. Rule 9:
          // it is only drawn when there is a photo to remove. The removal is a
          // draft change like any other — Save changes PATCHes `image: null`.
          draft.image ? (
            <DropdownMenuItem
              onSelect={() => setDraft((current) => ({ ...current, image: null }))}
            >
              Remove photo
            </DropdownMenuItem>
          ) : null
        }
        onSubmit={(event) => {
          event.preventDefault();
          updateMutation.mutate({
            name: draft.name.trim(),
            phone: draft.phone.trim() || null,
            // Sent only when it moved. An unchanged PATCH of the same url is
            // harmless, but it is also a write nobody asked for.
            ...(draft.image !== (profile.image ?? null) ? { image: draft.image } : {}),
          });
        }}
      >
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden="true">
            {draft.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.image} alt="" className={styles.markImage} />
            ) : (
              initialsOf(profile.name, profile.email)
            )}
          </span>

          {/*
            A real file input, opened by the button in front of it. `accept`
            names the three types the `user-avatar` upload policy allows, so
            the picker filters rather than the server refusing afterwards.

            It is out of the tab order and out of the accessibility tree on
            purpose: the button beside it is the same action under the name the
            board gives it, and two tab stops onto one file picker — one of them
            invisible — is worse than one.
          */}
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.photoInput}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared before the upload so picking the same file twice —
              // after a failure, say — still fires a change.
              event.target.value = "";
              if (file) photoMutation.mutate(file);
            }}
          />
          <button
            type="button"
            className={styles.photoButton}
            disabled={photoMutation.isPending}
            onClick={() => photoInput.current?.click()}
          >
            {photoMutation.isPending ? "Uploading…" : "Change photo"}
          </button>
        </div>

        <h3 className={styles.heading}>Details</h3>

        <FormField label="Name">
          {(id) => (
            <Input
              id={id}
              value={draft.name}
              required
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          )}
        </FormField>

        <FormField label="Email">
          {(id) => <Input id={id} value={profile.email} readOnly />}
        </FormField>

        <FormField label="Phone">
          {(id) => (
            <Input
              id={id}
              value={draft.phone}
              className={styles.monoField}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
            />
          )}
        </FormField>

        <h3 className={styles.heading}>Workspace</h3>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Workspace</span>
          <span className={styles.rowValue}>{profile.company.name}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Role</span>
          <span className={styles.rowValue}>{roleLabel(profile.role)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Member since</span>
          <span className={styles.rowMono}>{formatDate(profile.createdAt)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Password</span>
          <span className={styles.rowMono}>
            {/* Empty, not "Never changed": the row is a date column, and an
                account whose password is still its first one has no date to
                put there. */}
            {profile.passwordChangedAt
              ? `Changed ${formatDate(profile.passwordChangedAt)}`
              : ""}
          </span>
          <HeaderAction onClick={() => setChangingPassword(true)}>Change</HeaderAction>
        </div>
      </FormPage>

      <PasswordDialog
        open={changingPassword}
        onOpenChange={setChangingPassword}
        // The row's date is the only thing on this page the change moves, and
        // it comes off the profile query.
        onChanged={() => {
          void queryClient.invalidateQueries({ queryKey: ["preferences", "profile"] });
        }}
      />
    </PreferencesShell>
  );
}
