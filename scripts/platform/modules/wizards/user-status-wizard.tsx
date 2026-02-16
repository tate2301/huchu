import React, { useEffect, useMemo, useState } from "react";
import { Text, useInput } from "ink";

import type { PlatformServices, UserSummary } from "../../types";
import { applyTextInput, useInputLock } from "../input-utils";
import { SelectorList } from "./selector-list";
import { WizardFrame } from "./wizard-frame";

interface UserStatusWizardProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
  activate: boolean;
  setInputLocked?: (locked: boolean) => void;
  onBackToTree?: () => void;
}

type Step = 0 | 1;

function filterUsers(users: UserSummary[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return users;
  return users.filter((user) => {
    const haystack = `${user.name} ${user.email} ${user.role} ${user.companyName || user.companyId}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export function UserStatusWizard({
  actor,
  services,
  focusCompanyId,
  readOnly,
  activate,
  setInputLocked,
  onBackToTree,
}: UserStatusWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [reason, setReason] = useState("");
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
  const actionWord = activate ? "ACTIVATE" : "DEACTIVATE";

  useEffect(() => {
    setSelectedIndex((current) => Math.min(Math.max(0, visibleUsers.length - 1), current));
  }, [visibleUsers.length]);

  async function runStatusChange() {
    if (!selected) return;
    if (readOnly) {
      setErrorMessage("Read-only mode is enabled.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = activate
        ? await services.user.activate({ userId: selected.id, actor, reason: reason || undefined })
        : await services.user.deactivate({ userId: selected.id, actor, reason: reason || undefined });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setSuccessMessage(`${actionWord} completed for ${selected.email}`);
      setStatusMessage("User status update completed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Status update failed.");
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
        setStep(1);
        return;
      }
      setSearchQuery((current) => applyTextInput(current, input, key));
      return;
    }

    if (step === 1) {
      if (key.return) {
        void runStatusChange();
        return;
      }
      setReason((current) => applyTextInput(current, input, key));
    }
  });

  return (
    <WizardFrame
      title={`${activate ? "Activate" : "Deactivate"} User Wizard`}
      description="Guided user status update for MANAGER and CLERK accounts."
      step={step}
      steps={["Select User", "Reason & Apply"]}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      hints={[
        "Keys: Up/Down select, Enter next/submit, Esc back.",
        loading ? "Working..." : "Type on selection step to search by name/email/role/company.",
      ]}
      body={
        <>
          {step === 0 ? (
            <>
              <Text>search: {searchQuery || "<all users>"}</Text>
              <SelectorList
                items={visibleUsers}
                selectedIndex={selectedIndex}
                emptyMessage="No users available for selected scope."
                render={(item) =>
                  `${item.email} | ${item.role} | active ${String(item.isActive)} | ${item.companyName || item.companyId}`
                }
              />
            </>
          ) : null}
          {step === 1 ? (
            <>
              <Text>user: {selected?.email || "<none>"}</Text>
              <Text>reason: {reason || "<optional>"}</Text>
            </>
          ) : null}
        </>
      }
    />
  );
}
