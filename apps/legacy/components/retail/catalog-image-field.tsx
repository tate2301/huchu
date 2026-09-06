"use client";

/**
 * Pick a photograph for a shelf item, see it, replace it, remove it.
 *
 * S-7.8. Its own component rather than eighty more lines in a 700-line
 * catalogue page, and because the till is not the only place a shop will
 * eventually want to attach a picture to something it sells.
 *
 * ── The preview is a local object URL until the upload lands ───────────────
 *
 * A shopkeeper photographing thirty bottles wants to see immediately that they
 * picked the right one. Waiting for a round trip before showing anything makes
 * every pick feel broken on a slow connection, so the chosen file is rendered
 * from `URL.createObjectURL` straight away and swapped for the stored URL when
 * the upload returns. The object URL is revoked when it is replaced or the
 * component goes away — they pin the file in memory otherwise, and thirty of
 * them in one sitting is thirty photographs' worth.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { Loader2, Package, Trash2, Upload } from "@/lib/icons";
import { MAX_CATALOG_IMAGE_BYTES } from "@/lib/retail/catalog-image";

export function CatalogImageField({
  value,
  onChange,
  productId,
  disabled,
  onUploadingChange,
}: {
  /** The stored URL, or an empty string when the item has no photo. */
  value: string;
  onChange: (next: string) => void;
  /** Absent on a new item — see the route, which allows that. */
  productId?: string;
  disabled?: boolean;
  /**
   * Raised while an upload is in flight, so the dialog can hold its Save.
   *
   * Not cosmetic. The preview appears the instant a file is picked and the
   * upload can take several seconds behind it, so a shopkeeper who picks a
   * photo and immediately saves gets an item with no photo and no warning —
   * the form still held an empty `imageUrl`. It looked exactly like the feature
   * not working, which is worse than the feature not being there.
   */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // One place, so the parent can never miss a transition.
  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploadingChange?.(busy);
  };
  const [preview, setPreview] = useState<string | null>(null);

  // Revoke on unmount. The replace case is handled where it is replaced.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const shown = preview ?? (value || null);

  async function upload(file: File) {
    /*
      Checked here as well as on the server, purely so the answer is instant.
      The server's check is the one that counts — this one can be walked past
      by anybody with a terminal, and the endpoint sniffs the bytes regardless.
    */
    if (file.size > MAX_CATALOG_IMAGE_BYTES) {
      toast({
        title: "That photo is too big",
        description: `${(file.size / (1024 * 1024)).toFixed(1)}MB. Shelf photos have to be 2MB or smaller.`,
        variant: "destructive",
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return objectUrl;
    });
    setBusy(true);

    try {
      const body = new FormData();
      body.append("file", file);
      if (productId) body.append("productId", productId);

      /*
        `fetch` rather than the app's `fetchJson`, which sets a JSON content
        type. Multipart has to set its own boundary and the browser only does
        that when the header is left alone.
      */
      const response = await fetch("/api/v2/retail/catalog/image", {
        method: "POST",
        body,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || "That image could not be saved");
      }

      const url: string | undefined = payload?.data?.url ?? payload?.url;
      if (!url) throw new Error("The upload finished but returned no address");

      onChange(url);
      // The stored URL takes over from here.
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    } catch (error) {
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      toast({
        title: "Could not save that photo",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      // So picking the same file twice in a row still fires `change`.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold">Shelf photo</label>

      <div className="flex items-start gap-4">
        <div
          className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)]"
          aria-live="polite"
        >
          {shown ? (
            <Image
              src={shown}
              alt=""
              width={96}
              height={96}
              className="h-full w-full object-cover"
              /*
                The till renders these unoptimized too. The photos come off a
                blob host that is not in `next.config` and adding one there per
                storage backend is a worse trade than serving a 2MB-capped
                thumbnail as it stands.
              */
              unoptimized
            />
          ) : (
            <Package className="h-7 w-7 text-[var(--text-muted)]" aria-hidden />
          )}
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 space-y-2">
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            Shown on the till&rsquo;s item grid. PNG, JPEG or WebP, up to 2MB — a photo of the
            bottle on a plain background reads best at the counter.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {shown ? "Replace" : "Add photo"}
            </Button>
            {shown ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || uploading}
                onClick={() => {
                  setPreview((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return null;
                  });
                  // Clears it on the next save. The stored object is left in
                  // place — unpicking that is a housekeeping job.
                  onChange("");
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
