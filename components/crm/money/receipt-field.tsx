"use client";

import { useRef, useState } from "react";

import { FileUpload, useUpload } from "@corelithzw/react";
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
 * Built for somebody at a counter with a phone in one hand. "Take a photo"
 * goes straight to the camera on a phone, rather than through a chooser that
 * opens on the gallery; on a desktop the drop zone takes the PDF a supplier
 * emailed. The upload shows its progress, because on a bad connection a
 * receipt that looks stuck is a receipt somebody gives up on.
 *
 * The bytes go up first and the line is written with the url afterwards. The
 * other order leaves a line pointing at nothing, which reads as a receipt and
 * opens as an error.
 */
export function ReceiptField({
  value,
  onChange,
}: {
  value: UploadedReceipt | null;
  onChange: (next: UploadedReceipt | null) => void;
}) {
  const { upload, progress, status, response, reset } = useUpload();
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
      <div className="flex items-end gap-3">
        <div className="file-tile">
          <div className={isImage ? "ft-thumb img overflow-hidden" : "ft-thumb pdf"}>
            {isImage ? (
              // A receipt is checked by reading it, so the thumbnail is the
              // photograph itself rather than an icon standing in for it.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.url} alt="The receipt" className="size-full object-cover" />
            ) : (
              "PDF"
            )}
          </div>
          <div className="ft-body">
            <div className="ft-name">{name ?? "Receipt"}</div>
            <div className="ft-meta">{sizeLabel(value.size)}</div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
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
      </div>
    );
  }

  if (status === "uploading") {
    return (
      <div className="space-y-1.5" aria-live="polite">
        <Progress value={Math.round(progress * 100)} label="Uploading the receipt" />
        <p className="font-mono text-sm tabular-nums text-[var(--text-muted)]">
          Uploading {name ? `${name} ` : ""}— {Math.round(progress * 100)}%
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FileUpload
        accept="image/*,application/pdf"
        multiple={false}
        // Generous on purpose: the drop zone silently ignores anything over
        // its limit, and a file that does nothing when picked is worse than
        // one refused with the reason — which `send` does.
        maxSizeMb={100}
        label="Add the receipt"
        description={`A photo or a PDF, up to ${MAX_MB} MB`}
        onFilesSelected={(files) => {
          if (files[0]) void send(files[0]);
        }}
      />
      {/* Phones only: straight to the camera. A desktop has no camera worth
          pointing at a till slip, and the button would be a dead end there. */}
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
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
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
