"use client";

import { useRef, useState } from "react";

import { useUpload } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PhotoCamera } from "@/lib/icons";

/** What the upload route hands back, and what a cost line stores. */
export type UploadedReceipt = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
};

/** The server's limit for `crm-receipt`, checked here so the refusal says so. */
const MAX_MB = 10;

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * The receipt for one line of money: a photo or a PDF.
 *
 * One row, the way the Profile board draws "Change photo" — a button beside
 * what is there — rather than a drop zone taller than the rest of the form
 * with a sentence under it saying what files it takes. The limit is not
 * written on the page; a file over it is refused with the reason, which is
 * the one moment anybody needs to know it.
 *
 * Built for somebody at a counter with a phone in one hand: "Take a photo"
 * goes straight to the camera, rather than through a chooser that opens on
 * the gallery. A desktop still takes the PDF a supplier emailed, from the
 * chooser or dropped on the row. The upload shows its progress, because on a
 * bad connection a receipt that looks stuck is a receipt somebody gives up
 * on.
 *
 * The bytes go up first and the line is written with the url afterwards. The
 * other order leaves a line pointing at nothing, which reads as a receipt and
 * opens as an error.
 */
export function ReceiptField({
  id,
  value,
  onChange,
}: {
  /** The chooser's id, so a field label can point at it. */
  id?: string;
  value: UploadedReceipt | null;
  onChange: (next: UploadedReceipt | null) => void;
}) {
  const { upload, progress, status, response, reset } = useUpload();
  const chooserRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async (file: File) => {
    setProblem(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setProblem(`That file is ${sizeLabel(file.size)}. Receipts can be up to ${MAX_MB} MB.`);
      return;
    }
    setName(file.name);
    const form = new FormData();
    form.append("file", file);
    form.append("context", "crm-receipt");
    try {
      const uploaded = (await upload("/api/v2/crm/uploads", form)) as UploadedReceipt;
      onChange(uploaded);
    } catch {
      // Shown from the upload's own state below: it keeps the server's parsed
      // body on a refusal, so its words reach the person rather than a status.
    }
  };

  const refusal =
    status === "error"
      ? ((response as { error?: string } | undefined)?.error ??
        "That did not upload. Check the connection and try again.")
      : null;

  if (value) {
    const isImage = value.contentType.startsWith("image/");
    return (
      <div className="flex min-h-9 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-muted)] font-mono text-sm text-[var(--text-muted)]">
          {isImage ? (
            // A receipt is checked by reading it, so the thumbnail is the
            // photograph itself rather than an icon standing in for it.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt="The receipt" className="size-full object-cover" />
          ) : (
            "PDF"
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-[var(--text-strong)]">{name ?? "Receipt"}</span>
          <span className="block font-mono text-sm tabular-nums text-[var(--text-muted)]">
            {sizeLabel(value.size)}
          </span>
        </span>
        <Button asChild variant="ghost" size="sm">
          <a href={value.url} target="_blank" rel="noreferrer">
            View
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            setName(null);
            reset();
          }}
        >
          Remove
        </Button>
      </div>
    );
  }

  if (status === "uploading") {
    return (
      <div className="space-y-1.5" aria-live="polite">
        <Progress value={Math.round(progress * 100)} label="Uploading the receipt" />
        <p className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
          {name ?? "Receipt"} — {Math.round(progress * 100)}%
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) void send(file);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Phones first: straight to the camera. A desktop has no camera
            worth pointing at a till slip, so it is not offered there. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden gap-2 [@media(pointer:coarse)]:inline-flex"
          onClick={() => cameraRef.current?.click()}
        >
          <PhotoCamera className="size-4" aria-hidden="true" />
          Take a photo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => chooserRef.current?.click()}>
          Attach a file
        </Button>
      </div>
      <input
        ref={chooserRef}
        id={id}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void send(file);
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void send(file);
        }}
      />
      {problem ?? refusal ? (
        <p role="alert" className="text-sm text-[var(--status-error-text)]">
          {problem ?? refusal}
        </p>
      ) : null}
    </div>
  );
}
