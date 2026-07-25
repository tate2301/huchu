import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { PlatformServices, UserManagementRole, UserSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface UserRoleWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1 | 2 | 3;

const ROLE_OPTIONS: UserManagementRole[] = ["MANAGER", "CLERK"];

function getSuggestedRole(user: UserSummary | null): UserManagementRole {
  if (!user || user.role === "CLERK") return "MANAGER";
  return "CLERK";
}

function filterUsers(users: UserSummary[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return users;
  return users.filter((user) => {
    const haystack = `${user.name} ${user.email} ${user.role} ${user.companyName || user.companyId}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function UserRoleWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  setInputLocked,
  onBackToTree,
}: UserRoleWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleIndex, setRoleIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [confirmDraft, setConfirmDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useInputLock(setInputLocked, true);

  useEffect(() => {
    let ignore = false;
    async function loadUsers() {
      try {
        const rows = await services.user.list({ companyId: focusCompanyId || undefined, limit: 100 });
        if (!ignore) {
          setUsers(rows);
          setSelectedIndex(0);
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Failed to load users.");
      }
    }
    void loadUsers();
    return () => {
      ignore = true;
    };
  }, [focusCompanyId, services.user]);

  const visibleUsers = useMemo(() => filterUsers(users, searchQuery), [users, searchQuery]);
  const selected = visibleUsers[selectedIndex] ?? null;
  const selectedRole = ROLE_OPTIONS[roleIndex] ?? ROLE_OPTIONS[0];
  const requiresTypedConfirmation = false;
  const confirmPhrase = useMemo(
    () => `CONFIRM ROLE ${selected?.email || "user"} ${selectedRole}`,
    [selectedRole, selected?.email],
  );

  useEffect(() => {
    setSelectedIndex((current) => Math.min(Math.max(0, visibleUsers.length - 1), current));
  }, [visibleUsers.length]);

  async function runRoleChange() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    if (selected.role === selectedRole) {
      setErrorMessage(`User ${selected.email} is already ${selectedRole}.`);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await services.user.changeRole({
        userId: selected.id,
        role: selectedRole,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`Role changed for ${selected.email}: ${result.resource.beforeRole} -> ${result.resource.afterRole}`);
      setStatusMessage("User role update completed.");
      setConfirmDraft("");
      setReason("");
      setStep(0);
      setSearchQuery("");
      setSelectedIndex(0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Role change failed.");
    } finally {
      setLoading(false);
    }
  }

  useInput((input, key) => {
    if (loading) return;

    if (key.escape) {
      if (step === 0) {
        onBackToTree?.();
        return;
      }
      setStep((current) => (Math.max(0, current - 1) as Step));
      return;
    }

    if (step === 0) {
      if (key.upArrow) {
        setSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((current) => Math.min(Math.max(0, visibleUsers.length - 1), current + 1));
        return;
      }
      if (key.return) {
        if (!selected) {
          setErrorMessage("No user selected.");
          return;
        }
        const suggested = getSuggestedRole(selected);
        const nextIndex = ROLE_OPTIONS.indexOf(suggested);
        setRoleIndex(nextIndex >= 0 ? nextIndex : 0);
        setStep(1);
        return;
      }
      setSearchQuery((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 1) {
      if (key.upArrow) {
        setRoleIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow) {
        setRoleIndex((current) => Math.min(Math.max(0, ROLE_OPTIONS.length - 1), current + 1));
        return;
      }
      if (key.return) {
        setStep(2);
      }
      return;
    }

    if (step === 2) {
      if (key.return) {
        setStep(3);
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 3) {
      if (key.return) {
        if (requiresTypedConfirmation && confirmDraft.trim() !== confirmPhrase) {
          setErrorMessage(`Type exact phrase: ${confirmPhrase}`);
          return;
        }
        void runRoleChange();
        return;
      }
      if (requiresTypedConfirmation) {
        setConfirmDraft((current) => applyTextInput(current, input, key));
      }
    }
  });

  return (
    <WizardFrame
      title="Change User Role Wizard"
      description="Switch MANAGER and CLERK roles with review before apply."
      step={step}
      steps={["Select User", "Select Role", "Reason", "Review & Confirm"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        loading ? "Working..." : "Type on selection step to filter users.",
      ]}
      body={
        <>
          {step === 0 ? (
            <>
              <Text>search: {searchQuery || "<all users>"}</Text>
              <SelectorList
                items={visibleUsers}
                selectedIndex={selectedIndex}
                emptyMessage="No users available."
                render={(item) => `${item.email} | ${item.role} | ${item.companyName || item.companyId}`}
              />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Text>user: {selected?.email || "<none>"}</Text>
              <SelectorList
                items={ROLE_OPTIONS}
                selectedIndex={roleIndex}
                emptyMessage="No roles available."
                render={(item) => item}
              />
            </>
          ) : null}
          {step === 2 ? (
            <>
              <Text>user: {selected?.email || "<none>"}</Text>
              <Text>new role: {selectedRole}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Text>user: {selected?.email || "<none>"}</Text>
              <Text>current role: {selected?.role || "<none>"}</Text>
              <Text>new role: {selectedRole}</Text>
              <Text>reason: {reason || "<none>"}</Text>
              {requiresTypedConfirmation ? (
                <>
                  <Text color="yellow">Type: {confirmPhrase}</Text>
                  <Text>Input: {confirmDraft || "<waiting>"}</Text>
                </>
              ) : (
                <Text color="yellow">Press Enter to confirm.</Text>
              )}
            </>
          ) : null}
        </>
      }
    />
  );
}
