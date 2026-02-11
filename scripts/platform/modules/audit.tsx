import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { AuditEventRecord, PlatformServices } from "../types";

type EditingField = "actor" | "action" | "companyId" | "search";
type NoteField = "companyId" | "message";

interface AuditModuleProps {
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

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(event: AuditEventRecord, query: string) {
  if (!query) return true;
  const text = [
    event.id,
    event.timestamp,
    event.actor,
    event.action,
    event.entityType,
    event.entityId,
    event.companyId,
    event.reason,
  ]
    .map((value) => normalize(value as string))
    .join(" ");
  return text.includes(query);
}

export function AuditModule({ actor, services, focusCompanyId, readOnly }: AuditModuleProps) {
  const [rows, setRows] = useState<AuditEventRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [filters, setFilters] = useState({
    actor: "",
    action: "",
    companyId: focusCompanyId || "",
    search: "",
    limit: 50,
  });

  const [editingField, setEditingField] = useState<EditingField | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [noteMode, setNoteMode] = useState(false);
  const [noteField, setNoteField] = useState<NoteField>("companyId");
  const [noteDraft, setNoteDraft] = useState({ companyId: focusCompanyId || "", message: "" });

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, normalize(filters.search))),
    [filters.search, rows],
  );

  const selected = filteredRows[selectedIndex] ?? null;

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await services.audit.list({
        limit: filters.limit,
        actor: filters.actor || undefined,
        action: filters.action || undefined,
        companyId: filters.companyId || undefined,
      });
      setRows(data);
      setSelectedIndex((current) => Math.min(current, Math.max(0, data.length - 1)));
    } catch (error) {
      setRows([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  }, [filters, services.audit]);

  useEffect(() => {
    void loadRows();
  }, [loadRows, refreshToken]);

  const addNote = useCallback(async () => {
    const result = await services.audit.addNote({
      actor,
      companyId: noteDraft.companyId.trim(),
      message: noteDraft.message.trim(),
    });
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }
    setStatusMessage("Audit note added");
    setNoteMode(false);
    setNoteField("companyId");
    setNoteDraft((current) => ({ ...current, message: "" }));
    setRefreshToken((current) => current + 1);
  }, [actor, noteDraft, services.audit]);

  useInput((input, key) => {
    if (editingField) {
      if (key.escape) {
        setEditingField(null);
        setEditDraft("");
        return;
      }
      if (key.return) {
        const value = editDraft.trim();
        setFilters((current) => ({ ...current, [editingField]: value }));
        setEditingField(null);
        setEditDraft("");
        if (editingField !== "search") {
          setRefreshToken((current) => current + 1);
        }
        return;
      }
      setEditDraft((current) => applyTextInput(current, input, key));
      return;
    }

    if (noteMode) {
      if (key.escape) {
        setNoteMode(false);
        return;
      }
      if (key.tab) {
        setNoteField((current) => (current === "companyId" ? "message" : "companyId"));
        return;
      }
      if (key.return) {
        if (noteField === "companyId") {
          setNoteField("message");
          return;
        }
        if (!readOnly) {
          void addNote();
        }
        return;
      }
      setNoteDraft((current) => ({
        ...current,
        [noteField]: applyTextInput(current[noteField], input, key),
      }));
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(filteredRows.length - 1, current + 1));
      return;
    }

    if (input === "l") {
      setRefreshToken((current) => current + 1);
      return;
    }
    if (input === "/") {
      setEditingField("search");
      setEditDraft(filters.search);
      return;
    }
    if (input === "a") {
      setEditingField("actor");
      setEditDraft(filters.actor);
      return;
    }
    if (input === "k") {
      setEditingField("action");
      setEditDraft(filters.action);
      return;
    }
    if (input === "c") {
      setEditingField("companyId");
      setEditDraft(filters.companyId);
      return;
    }
    if (input === "n" && !readOnly) {
      setNoteMode(true);
      setNoteField(noteDraft.companyId ? "message" : "companyId");
    }
  });

  const visibleRows = filteredRows.slice(Math.max(0, selectedIndex - 8), Math.max(0, selectedIndex - 8) + 16);
  const windowStart = Math.max(0, selectedIndex - 8);

  return (
    <Box flexDirection="column">
      <Text bold>Audit</Text>
      <Text dimColor>
        actor[{filters.actor || "all"}] action[{filters.action || "all"}] company[{filters.companyId || "all"}] search[
        {filters.search || "off"}]
      </Text>
      {loading ? <Text color="yellow">Loading...</Text> : null}

      <Box marginTop={1} flexDirection="column">
        {visibleRows.length ? (
          visibleRows.map((row, offset) => {
            const absoluteIndex = windowStart + offset;
            const isSelected = absoluteIndex === selectedIndex;
            const prefix = isSelected ? ">" : " ";
            return (
              <Text key={row.id} color={isSelected ? "cyan" : undefined}>
                {prefix} {row.timestamp || "-"} | {row.action || "AUDIT"} | {row.actor || "system"} | {row.reason || "-"}
              </Text>
            );
          })
        ) : (
          <Text dimColor>No audit events found.</Text>
        )}
      </Box>

      {selected ? (
        <Box marginTop={1} flexDirection="column">
          <Text>ID: {selected.id}</Text>
          <Text>Entity: {selected.entityType || "-"} / {selected.entityId || "-"}</Text>
          <Text>Company: {selected.companyId || "-"}</Text>
          <Text>Reason: {selected.reason || "-"}</Text>
        </Box>
      ) : null}

      {editingField ? (
        <Text color="yellow">Editing {editingField}: {editDraft || "<empty>"} (Enter save, Esc cancel)</Text>
      ) : null}

      {noteMode ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">Add audit note</Text>
          <Text color={noteField === "companyId" ? "cyan" : undefined}>companyId: {noteDraft.companyId || "<required>"}</Text>
          <Text color={noteField === "message" ? "cyan" : undefined}>message: {noteDraft.message || "<required>"}</Text>
          <Text dimColor>Tab switch field, Enter submit on message, Esc cancel.</Text>
        </Box>
      ) : null}

      {errorMessage ? <Text color="red">Error: {errorMessage}</Text> : null}
      {statusMessage ? <Text color="green">{statusMessage}</Text> : null}

      <Text dimColor>Keys: Up/Down select | l reload | / search | a actor | k action | c company | n add note</Text>
    </Box>
  );
}
