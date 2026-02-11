import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { AdminSummary, PlatformServices } from "../types";

type EditingField = "companyId" | "reason";
type CreateField = "companyId" | "email" | "name" | "password" | "role";
type PendingAction = "ACTIVATE" | "DEACTIVATE" | "RESET_PASSWORD";

interface AdminsModuleProps {
  actor: string;
  services: PlatformServices;
  focusCompanyId: string | null;
  readOnly: boolean;
}

function applyTextInput(current: string, input: string, key: { backspace?: boolean; delete?: boolean }) {
  if (key.backspace || key.delete) return current.slice(0, -1);
  if (!input) return current;
  const code = input.charCodeAt(0);
  if (Number.isNaN(code) || code < 32 || code === 127) return current;
  return `${current}${input}`;
}

const CREATE_FIELDS: CreateField[] = ["companyId", "email", "name", "password", "role"];

export function AdminsModule({ actor, services, focusCompanyId, readOnly }: AdminsModuleProps) {
  const [rows, setRows] = useState<AdminSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [companyId, setCompanyId] = useState(focusCompanyId || "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmDraft, setConfirmDraft] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [captureResetPassword, setCaptureResetPassword] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createField, setCreateField] = useState<CreateField>("companyId");
  const [createDraft, setCreateDraft] = useState({
    companyId: focusCompanyId || "",
    email: "",
    name: "",
    password: "",
    role: "SUPERADMIN",
  });

  const selected = rows[selectedIndex] ?? null;
  const expectedConfirmation = useMemo(() => {
    if (!selected || !pendingAction) return "";
    return `CONFIRM ${pendingAction} ${selected.email}`;
  }, [pendingAction, selected]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await services.admin.list({
        companyId: companyId || undefined,
        limit: 100,
      });
      setRows(data);
      setSelectedIndex((current) => Math.min(current, Math.max(0, data.length - 1)));
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load admins");
    } finally {
      setLoading(false);
    }
  }, [companyId, services.admin]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  const runCreate = useCallback(async () => {
    const result = await services.admin.create({
      companyId: createDraft.companyId,
      email: createDraft.email,
      name: createDraft.name,
      password: createDraft.password,
      role: createDraft.role,
      actor,
    });
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setStatusMessage(`Created admin ${result.resource.email}`);
    setShowCreate(false);
    setCreateField("companyId");
    setCreateDraft({ companyId: focusCompanyId || "", email: "", name: "", password: "", role: "SUPERADMIN" });
    setRefreshToken((current) => current + 1);
  }, [actor, createDraft, focusCompanyId, services.admin]);

  const runPendingAction = useCallback(async () => {
    if (!selected || !pendingAction) return;
    if (pendingAction === "ACTIVATE") {
      const result = await services.admin.activate({ userId: selected.id, actor, reason: reason || undefined });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setStatusMessage(`Activated ${selected.email}`);
    } else if (pendingAction === "DEACTIVATE") {
      const result = await services.admin.deactivate({ userId: selected.id, actor, reason: reason || undefined });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setStatusMessage(`Deactivated ${selected.email}`);
    } else {
      const result = await services.admin.resetPassword({
        userId: selected.id,
        newPassword,
        actor,
        reason: reason || undefined,
      });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setStatusMessage(`Password reset for ${selected.email}`);
    }
    setPendingAction(null);
    setConfirmDraft("");
    setNewPassword("");
    setCaptureResetPassword(false);
    setRefreshToken((current) => current + 1);
  }, [actor, newPassword, pendingAction, reason, selected, services.admin]);

  useInput((input, key) => {
    if (showCreate) {
      if (key.escape) {
        setShowCreate(false);
        return;
      }
      if (key.tab) {
        const nextIndex = (CREATE_FIELDS.indexOf(createField) + 1) % CREATE_FIELDS.length;
        setCreateField(CREATE_FIELDS[nextIndex]);
        return;
      }
      if (key.return) {
        if (createField !== "role") {
          const nextIndex = (CREATE_FIELDS.indexOf(createField) + 1) % CREATE_FIELDS.length;
          setCreateField(CREATE_FIELDS[nextIndex]);
          return;
        }
        if (!readOnly) void runCreate();
        return;
      }
      setCreateDraft((current) => ({
        ...current,
        [createField]: applyTextInput(current[createField], input, key),
      }));
      return;
    }

    if (editingField) {
      if (key.escape) {
        setEditingField(null);
        setEditDraft("");
        return;
      }
      if (key.return) {
        const value = editDraft.trim();
        if (editingField === "companyId") {
          setCompanyId(value);
          setRefreshToken((current) => current + 1);
        } else {
          setReason(value);
        }
        setEditingField(null);
        setEditDraft("");
        return;
      }
      setEditDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (captureResetPassword) {
      if (key.escape) {
        setCaptureResetPassword(false);
        setNewPassword("");
        return;
      }
      if (key.return) {
        setCaptureResetPassword(false);
        return;
      }
      setNewPassword((current) => applyTextInput(current, input, key));
      return;
    }

    if (pendingAction) {
      if (key.escape) {
        setPendingAction(null);
        setConfirmDraft("");
        setNewPassword("");
        return;
      }
      if (key.return) {
        if (confirmDraft.trim() === expectedConfirmation) {
          void runPendingAction();
        } else {
          setErrorMessage("Confirmation phrase does not match.");
        }
        return;
      }
      setConfirmDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(rows.length - 1, current + 1));
      return;
    }

    if (input === "l") {
      setRefreshToken((current) => current + 1);
      return;
    }
    if (input === "c") {
      setEditingField("companyId");
      setEditDraft(companyId);
      return;
    }
    if (input === "y") {
      setEditingField("reason");
      setEditDraft(reason);
      return;
    }
    if (input === "n" && !readOnly) {
      setShowCreate(true);
      return;
    }
    if (input === "a" && !readOnly && selected) {
      setPendingAction("ACTIVATE");
      setConfirmDraft("");
      return;
    }
    if (input === "d" && !readOnly && selected) {
      setPendingAction("DEACTIVATE");
      setConfirmDraft("");
      return;
    }
    if (input === "w" && !readOnly && selected) {
      setPendingAction("RESET_PASSWORD");
      setCaptureResetPassword(true);
      setNewPassword("");
      setConfirmDraft("");
    }
  });

  const visibleRows = rows.slice(Math.max(0, selectedIndex - 8), Math.max(0, selectedIndex - 8) + 16);
  const windowStart = Math.max(0, selectedIndex - 8);

  return (
    <Box flexDirection="column">
      <Text bold>Admins</Text>
      <Text dimColor>Company: {companyId || "all"} | Mode: {readOnly ? "read-only" : "read-write"} | Reason: {reason || "<none>"}</Text>
      {loading ? <Text color="yellow">Loading...</Text> : null}

      <Box marginTop={1} flexDirection="column">
        {visibleRows.length ? (
          visibleRows.map((row, offset) => {
            const absoluteIndex = windowStart + offset;
            const isSelected = absoluteIndex === selectedIndex;
            const prefix = isSelected ? ">" : " ";
            return (
              <Text key={row.id} color={isSelected ? "cyan" : undefined}>
                {prefix} {row.email} | {row.role} | active {String(row.isActive)} | {row.companyName || row.companyId}
              </Text>
            );
          })
        ) : (
          <Text dimColor>No admins found.</Text>
        )}
      </Box>

      {showCreate ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Create Admin</Text>
          <Text color={createField === "companyId" ? "cyan" : undefined}>companyId: {createDraft.companyId || "<required>"}</Text>
          <Text color={createField === "email" ? "cyan" : undefined}>email: {createDraft.email || "<required>"}</Text>
          <Text color={createField === "name" ? "cyan" : undefined}>name: {createDraft.name || "<required>"}</Text>
          <Text color={createField === "password" ? "cyan" : undefined}>password: {createDraft.password ? "***" : "<required>"}</Text>
          <Text color={createField === "role" ? "cyan" : undefined}>role: {createDraft.role || "SUPERADMIN"}</Text>
          <Text dimColor>Tab next, Enter submit on role, Esc cancel.</Text>
        </Box>
      ) : null}

      {captureResetPassword ? (
        <Box flexDirection="column">
          <Text color="yellow">Enter new password for reset</Text>
          <Text>newPassword: {newPassword ? "***" : "<required>"}</Text>
          <Text dimColor>Enter done, Esc cancel.</Text>
        </Box>
      ) : null}

      {pendingAction && selected ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Confirm {pendingAction}</Text>
          <Text>Type: {expectedConfirmation}</Text>
          <Text>Input: {confirmDraft || "<waiting>"}</Text>
          {pendingAction === "RESET_PASSWORD" ? <Text>newPassword: {newPassword ? "***" : "<required>"}</Text> : null}
          <Text dimColor>Enter confirm, Esc cancel.</Text>
        </Box>
      ) : null}

      {editingField ? (
        <Text color="yellow">Editing {editingField}: {editDraft || "<empty>"} (Enter save, Esc cancel)</Text>
      ) : null}

      {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      {statusMessage ? <Text color="green">{statusMessage}</Text> : null}

      <Text dimColor>Keys: Up/Down select | l reload | c company | y reason | n create | a activate | d deactivate | w reset password</Text>
    </Box>
  );
}
