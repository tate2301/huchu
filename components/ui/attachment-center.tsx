"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { ArrowUpward, FileCheck, FileText, Plus, Shield, Trash2 } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type AttachmentCenterItem = {
  id: string;
  name: string;
  description?: string;
  meta?: string;
  href?: string;
};

type AttachmentCenterProps = {
  title?: string;
  description?: string;
  items?: AttachmentCenterItem[];
  className?: string;
  readOnly?: boolean;
  dropLabel?: string;
  dropHint?: string;
  emptyLabel?: string;
  onFilesSelected?: (files: File[]) => void;
  onAddLink?: () => void;
  onLinkEvidence?: () => void;
  onLinkPolicy?: () => void;
  onOpenItem?: (item: AttachmentCenterItem) => void;
  onRemoveItem?: (item: AttachmentCenterItem) => void;
};

export function AttachmentCenter({
  title = "Attachments",
  description,
  items = [],
  className,
  readOnly = false,
  dropLabel = "Drag and drop files here",
  dropHint = "or choose files to upload",
  emptyLabel = "No attachments yet.",
  onFilesSelected,
  onAddLink,
  onLinkEvidence,
  onLinkPolicy,
  onOpenItem,
  onRemoveItem,
}: AttachmentCenterProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const canUpload = !readOnly && Boolean(onFilesSelected);

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      if (!files || !onFilesSelected || readOnly) return;
      onFilesSelected(Array.from(files));
    },
    [onFilesSelected, readOnly],
  );

  return (
    <section
      className={cn(
        "space-y-4 rounded-lg border border-[var(--edge-subtle)] bg-card p-4 text-card-foreground shadow-[var(--card-shadow-rest)]",
        className,
      )}
    >
      <header className="space-y-1">
        <h3 className="text-section-title text-foreground">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>

      <div
        className={cn(
          "rounded-lg border border-dashed p-4 transition-colors",
          canUpload ? "cursor-pointer border-border bg-muted/20" : "border-border/70 bg-muted/10",
          canUpload && isDragging ? "border-primary bg-primary/5" : null,
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (canUpload) setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (canUpload) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (canUpload) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        onClick={() => {
          if (canUpload) inputRef.current?.click();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-muted p-2 text-muted-foreground">
            <ArrowUpward />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{dropLabel}</p>
            <p className="text-xs text-muted-foreground">
              {canUpload ? dropHint : "Upload is disabled in read-only mode."}
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
          disabled={!canUpload}
        />

        {canUpload ? (
          <Button type="button" variant="outline" size="sm" className="mt-3">
            Choose files
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/80 bg-muted/10 px-3 py-2"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="text-muted-foreground" />
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium text-primary hover:underline"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="truncate text-left text-sm font-medium text-foreground"
                      disabled={!onOpenItem || readOnly}
                      onClick={() => onOpenItem?.(item)}
                    >
                      {item.name}
                    </button>
                  )}
                </div>
                {item.description ? (
                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                ) : null}
                {item.meta ? <p className="text-xs text-muted-foreground">{item.meta}</p> : null}
              </div>
              {onRemoveItem && !readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemoveItem(item)}
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--card-divider)] pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || !onAddLink}
          onClick={() => onAddLink?.()}
        >
          <Plus />
          Add link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || !onLinkEvidence}
          onClick={() => onLinkEvidence?.()}
        >
          <FileCheck />
          Link evidence
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly || !onLinkPolicy}
          onClick={() => onLinkPolicy?.()}
        >
          <Shield />
          Link policy
        </Button>
      </div>
    </section>
  );
}
