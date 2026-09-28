"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { FormField } from "@/components/management/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { changeOwnPassword } from "@/lib/preferences/api";

import styles from "./account.module.css";

/**
 * The Change verb on `Account.dc.html`'s Password row.
 *
 * The board draws the row and the verb, not what the verb opens — so this is
 * the smallest thing that can honestly be behind it: the two fields
 * `POST /api/preferences/password` takes, in the surface's own field chrome,
 * over the same Save/Cancel rung `FormPage` draws.
 *
 * A dialog rather than a disclosure inside the profile form, for one structural
 * reason: the profile page *is* a `<form>`, and a second form nested in it is
 * invalid HTML — the inner submit would post the outer form. `DialogContent`
 * portals to `document.body`, so this form is a sibling of that one and both
 * submit on their own. The surface's control corrections follow it there; they
 * are written against a scope class on `<body>`, which is why they were put
 * there (see `settings.module.css`).
 *
 * There is no confirm-the-new-password field. It is not a second fact about
 * the account, the browser's own password manager fills and verifies one field,
 * and the server is the only thing that can tell whether the change took — rule
 * 1: if a control needs explaining, it is the wrong control.
 *
 * The rules the server enforces are not restated here as helper text either:
 * `minLength={8}` is on the field, and anything else the route rejects (the new
 * password matching the old one, an OAuth account with no password, ten tries a
 * minute) comes back as the sentence to show.
 */
export function PasswordDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful change, so the caller can refresh its own copy. */
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const reset = React.useCallback(() => {
    setCurrentPassword("");
    setNewPassword("");
  }, []);

  const changeMutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your new password is in use from now on.",
        variant: "success",
      });
      reset();
      onChanged?.();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Unable to change your password",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A password typed into a box that is about to close is not a draft
        // worth keeping, and keeping it would leave the old one in memory
        // behind a dialog nobody can see.
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className={styles.dialogTitle}>Change password</DialogTitle>
          {/* `DialogDescription` is `sr-only` by this repo's own styling — it
              names the dialog for a screen reader and draws nothing, so rule 1
              is not in play. */}
          <DialogDescription>
            Enter your current password, then the one you want to use instead.
          </DialogDescription>
        </DialogHeader>

        <form
          className={styles.dialogForm}
          onSubmit={(event) => {
            event.preventDefault();
            changeMutation.mutate({ currentPassword, newPassword });
          }}
        >
          <FormField label="Current password">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            )}
          </FormField>

          <FormField label="New password">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            )}
          </FormField>

          <div className={styles.dialogFooter}>
            <button
              type="submit"
              disabled={changeMutation.isPending}
              className={styles.dialogSubmit}
            >
              Change password
            </button>
            <button
              type="button"
              className={styles.dialogCancel}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
