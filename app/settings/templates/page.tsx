"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "@/components/layout/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type TemplateRow = {
  id: string;
  name: string;
  sourceKey: string;
  isDefault: boolean;
};

type TemplateVersion = {
  id: string;
  version: number;
  schemaJson: string;
  isPublished: boolean;
};

type TemplateSchema = {
  header: {
    showLogo: boolean;
    showSecondaryLogo: boolean;
    showCompanyIdentity: boolean;
    showContactBlock: boolean;
  };
  table: {
    compact: boolean;
    zebra: boolean;
  };
  footer: {
    showFooterText: boolean;
    showDisclaimer: boolean;
    showPaymentDetails: boolean;
    showSignature: boolean;
    showStamp: boolean;
  };
};

function parseSchema(value: string): TemplateSchema {
  return JSON.parse(value) as TemplateSchema;
}

function tryParseSchema(value: string): TemplateSchema | null {
  try {
    return parseSchema(value);
  } catch {
    return null;
  }
}

export default function TemplateSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [schemaJsonDraft, setSchemaJsonDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newSourceKey, setNewSourceKey] = useState("reports.shift");

  const templatesQuery = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const response = await fetch("/api/document-templates");
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load templates");
      return payload as TemplateRow[];
    },
  });

  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const activeTemplateId = selectedTemplateId ?? templates[0]?.id ?? null;

  const versionsQuery = useQuery({
    queryKey: ["document-template-versions", activeTemplateId],
    enabled: Boolean(activeTemplateId),
    queryFn: async () => {
      const response = await fetch(`/api/document-templates/${activeTemplateId}/versions`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load versions");
      return payload as TemplateVersion[];
    },
  });

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);
  const activeVersionId =
    selectedVersionId && versions.some((version) => version.id === selectedVersionId)
      ? selectedVersionId
      : (versions.find((version) => version.isPublished)?.id ?? versions[0]?.id ?? null);
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === activeVersionId) ?? null,
    [activeVersionId, versions],
  );
  const effectiveSchemaJson = schemaJsonDraft || selectedVersion?.schemaJson || "";
  const schemaDraft = useMemo(() => tryParseSchema(effectiveSchemaJson), [effectiveSchemaJson]);

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/document-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          sourceKey: newSourceKey.trim(),
          documentType: "REPORT_TABLE",
          targetType: "LIST",
          cloneFromSystemDefault: true,
          setDefault: true,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to create template");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      setNewName("");
      toast({ title: "Template created", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Create failed", description: error.message, variant: "destructive" });
    },
  });

  const saveVersionMutation = useMutation({
    mutationFn: async () => {
      if (!activeTemplateId || !schemaDraft) throw new Error("No template selected");
      const response = await fetch(`/api/document-templates/${activeTemplateId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaJson: JSON.stringify(schemaDraft) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to save version");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-template-versions", activeTemplateId] });
      setSchemaJsonDraft("");
      toast({ title: "Version saved", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!activeTemplateId || !activeVersionId) throw new Error("No version selected");
      const response = await fetch(`/api/document-templates/${activeTemplateId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: activeVersionId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to publish");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-template-versions", activeTemplateId] });
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({ title: "Version published", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!activeTemplateId) throw new Error("No template selected");
      const response = await fetch(`/api/document-templates/${activeTemplateId}/set-default`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Failed to set default");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({ title: "Template marked default", variant: "success" });
    },
    onError: (error: Error) => {
      toast({ title: "Default update failed", description: error.message, variant: "destructive" });
    },
  });

  const updateFlag = (section: keyof TemplateSchema, key: string, checked: boolean) => {
    if (!schemaDraft) return;
    const next = {
      ...schemaDraft,
      [section]: {
        ...schemaDraft[section],
        [key]: checked,
      },
    };
    setSchemaJsonDraft(JSON.stringify(next, null, 2));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Document Templates" description="Customize how branded reports and documents are rendered." />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader><CardTitle>Create Template</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Template name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Source key (e.g. reports.shift)" value={newSourceKey} onChange={(e) => setNewSourceKey(e.target.value)} />
            <Button type="button" className="w-full" onClick={() => createTemplateMutation.mutate()} disabled={createTemplateMutation.isPending || !newName.trim()}>{createTemplateMutation.isPending ? "Creating..." : "Create"}</Button>
            <div className="space-y-2 pt-2">
              {templates.map((row) => (
                <button key={row.id} type="button" className={`w-full rounded border p-2 text-left ${activeTemplateId === row.id ? "border-primary" : "border-border"}`} onClick={() => { setSelectedTemplateId(row.id); setSelectedVersionId(null); setSchemaJsonDraft(""); }}>
                  <p className="text-sm font-semibold">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.sourceKey}</p>
                  {row.isDefault ? <Badge className="mt-1">Default</Badge> : null}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Template Designer</CardTitle>
            <CardDescription>Visual toggles for core blocks plus JSON advanced editor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!activeTemplateId ? (
              <p className="text-sm text-muted-foreground">Select a template to edit.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {versions.map((version) => (
                    <Button key={version.id} type="button" size="sm" variant={activeVersionId === version.id ? "default" : "outline"} onClick={() => { setSelectedVersionId(version.id); setSchemaJsonDraft(version.schemaJson); }}>
                      v{version.version}{version.isPublished ? " *" : ""}
                    </Button>
                  ))}
                </div>
                {schemaDraft ? (
                  <>
                    <div className="grid gap-2 md:grid-cols-3">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.header.showLogo} onChange={(e) => updateFlag("header", "showLogo", e.target.checked)} />Show logo</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.header.showCompanyIdentity} onChange={(e) => updateFlag("header", "showCompanyIdentity", e.target.checked)} />Company identity</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.header.showContactBlock} onChange={(e) => updateFlag("header", "showContactBlock", e.target.checked)} />Contact block</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.table.compact} onChange={(e) => updateFlag("table", "compact", e.target.checked)} />Compact rows</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.table.zebra} onChange={(e) => updateFlag("table", "zebra", e.target.checked)} />Zebra rows</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.footer.showPaymentDetails} onChange={(e) => updateFlag("footer", "showPaymentDetails", e.target.checked)} />Payment block</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.footer.showFooterText} onChange={(e) => updateFlag("footer", "showFooterText", e.target.checked)} />Footer text</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.footer.showDisclaimer} onChange={(e) => updateFlag("footer", "showDisclaimer", e.target.checked)} />Disclaimer</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schemaDraft.footer.showSignature} onChange={(e) => updateFlag("footer", "showSignature", e.target.checked)} />Signature</label>
                    </div>
                    <Textarea value={schemaJsonDraft || JSON.stringify(schemaDraft, null, 2)} onChange={(e) => setSchemaJsonDraft(e.target.value)} className="min-h-[260px] font-mono text-xs" />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => { const parsed = tryParseSchema(schemaJsonDraft || JSON.stringify(schemaDraft)); if (!parsed) { toast({ title: "Invalid JSON", variant: "destructive" }); return; } setSchemaJsonDraft(JSON.stringify(parsed, null, 2)); }}>Apply JSON</Button>
                      <Button type="button" variant="outline" onClick={() => saveVersionMutation.mutate()} disabled={saveVersionMutation.isPending}>{saveVersionMutation.isPending ? "Saving..." : "Save New Version"}</Button>
                      <Button type="button" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || !activeVersionId}>{publishMutation.isPending ? "Publishing..." : "Publish"}</Button>
                      <Button type="button" variant="outline" onClick={() => setDefaultMutation.mutate()} disabled={setDefaultMutation.isPending}>{setDefaultMutation.isPending ? "Updating..." : "Set Default"}</Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Template JSON is invalid. Fix JSON to continue.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
