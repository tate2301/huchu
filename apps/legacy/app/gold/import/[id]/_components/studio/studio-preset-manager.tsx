"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/use-toast";
import { Save, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

type Preset = {
  id: string;
  name: string;
  mappingJson: string;
  sampleHeaderHash: string | null;
  isDefault: boolean;
  createdBy: { id: string; name: string };
  updatedAt: string;
};

export function StudioPresetManager({
  importId,
  isLocked,
  onPresetApplied,
}: {
  importId: string;
  isLocked: boolean;
  onPresetApplied: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const { data: presets = [] } = useQuery<Preset[]>({
    queryKey: ["import-presets"],
    queryFn: () => fetchJson("/api/gold/imports/presets"),
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      fetchJson<Preset>(`/api/gold/imports/${importId}/preset`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (preset) => {
      queryClient.setQueryData<Preset[]>(["import-presets"], (prev = []) => {
        const filtered = prev.filter((p) => p.id !== preset.id);
        return [preset, ...filtered];
      });
      toast({ title: `Preset "${preset.name}" saved`, variant: "success" });
      setSaveOpen(false);
      setPresetName("");
    },
    onError: (err) => {
      toast({
        title: "Could not save preset",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: (presetId: string) =>
      fetchJson(`/api/gold/imports/${importId}/apply-preset`, {
        method: "POST",
        body: JSON.stringify({ presetId }),
      }),
    onSuccess: () => {
      toast({ title: "Preset applied", variant: "success" });
      setApplyOpen(false);
      onPresetApplied();
    },
    onError: (err) => {
      toast({
        title: "Could not apply preset",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex items-center gap-1">
      {!isLocked && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setSaveOpen((o) => !o)}
            className="flex items-center gap-1 rounded border border-[--border] bg-[--surface-base] px-2 py-0.5 text-[10px] text-[--text-muted] hover:bg-[--surface-muted]"
          >
            <Save className="h-3 w-3" />
            Save as preset
          </button>
          {saveOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col gap-2 rounded border border-[--border] bg-[--surface-base] p-2 shadow-md">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (presetName.trim()) saveMutation.mutate(presetName.trim());
                  }
                  if (e.key === "Escape") setSaveOpen(false);
                }}
                placeholder="Preset name…"
                autoFocus
                className="rounded border border-[--border] bg-[--surface-muted] px-2 py-1 text-[11px] text-[--text-strong] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-[--ring]"
              />
              <button
                type="button"
                disabled={!presetName.trim() || saveMutation.isPending}
                onClick={() => { if (presetName.trim()) saveMutation.mutate(presetName.trim()); }}
                className="rounded bg-[--action-primary-bg] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}

      {presets.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setApplyOpen((o) => !o)}
            className="flex items-center gap-1 rounded border border-[--border] bg-[--surface-base] px-2 py-0.5 text-[10px] text-[--text-muted] hover:bg-[--surface-muted]"
          >
            Apply preset
            <ChevronDown className="h-3 w-3" />
          </button>
          {applyOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 max-h-48 w-56 overflow-y-auto rounded border border-[--border] bg-[--surface-base] shadow-md">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyMutation.mutate(p.id)}
                  disabled={applyMutation.isPending}
                  className={cn(
                    "flex w-full flex-col px-3 py-2 text-left hover:bg-[--surface-muted]",
                    applyMutation.isPending && "opacity-60",
                  )}
                >
                  <span className="text-[11px] font-medium text-[--text-strong]">{p.name}</span>
                  <span className="text-[10px] text-[--text-muted]">
                    by {p.createdBy.name}
                    {p.isDefault && " · default"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
