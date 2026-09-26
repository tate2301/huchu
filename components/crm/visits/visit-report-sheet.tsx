"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AttachmentCenter, Badge, Stack } from "@corelithzw/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientDate } from "@/components/ui/client-date";
import { Input } from "@/components/ui/input";
import { CataloguePicker } from "@/components/crm/documents/catalogue-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { FileText, MapPin, Plus, Trash2 } from "@/lib/icons";
import {
  fetchCrmVisitReport,
  saveCrmVisitReport,
  type CrmVisitChecklistItem,
  type CrmVisitPhoto,
} from "@/lib/crm/crm-v2";
import { buildDefaultChecklist, isPhoto, newClientPhotoId } from "@/lib/crm/site-visits";
import { DEFAULT_FIELD_CAMERA_APP, hasLocation, readPhotoGeotag } from "@/lib/crm/geotag";
import { GeotagNotice, useFieldCamera } from "@/components/crm/visits/geotag-notice";
import { VisitQuestionSections } from "@/components/crm/visits/visit-question-sections";

/**
 * What the row under a photo says about where it came from.
 *
 * The coordinates are drawn, not hidden behind a map link: whoever checks the
 * report is comparing them with an address, and five decimals is about a
 * metre — enough to tell this house from the one next door. A picture with no
 * location says so in words, in the warning tone, because a photo that cannot
 * prove where it was taken is the one somebody will ask about.
 */
function PhotoProvenance({ photo }: { photo: CrmVisitPhoto }) {
  if (!isPhoto(photo)) return <>{photo.contentType === "application/pdf" ? "PDF" : photo.contentType}</>;

  const latitude = photo.latitude ?? null;
  const longitude = photo.longitude ?? null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {latitude !== null && longitude !== null ? (
        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
          <MapPin aria-hidden="true" className="size-3.5" />
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </span>
      ) : (
        <Badge tone="warn" size="sm">
          No location
        </Badge>
      )}
      {photo.capturedAt ? (
        <span className="font-mono tabular-nums">
          <ClientDate value={photo.capturedAt} />
        </span>
      ) : null}
    </span>
  );
}

export type MeasurementDraft = {
  category: string;
  description: string;
  quantity: string;
  unit: string;
  widthMm: string;
  heightMm: string;
  depthMm: string;
  specNotes: string;
  unitPrice: string;
};

const UNITS = ["pcs", "m", "m²", "m³", "kg", "lot", "hrs"];

function emptyMeasurement(): MeasurementDraft {
  return {
    category: "",
    description: "",
    quantity: "1",
    unit: "pcs",
    widthMm: "",
    heightMm: "",
    depthMm: "",
    specNotes: "",
    unitPrice: "",
  };
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function VisitReportSheet({
  open,
  onOpenChange,
  appointmentId,
  appointmentNo,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string | null;
  appointmentNo?: string;
  /** Fired after a visit is closed out, with the items captured on site. */
  onCompleted?: (items: MeasurementDraft[]) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [checklist, setChecklist] = useState<CrmVisitChecklistItem[]>([]);
  const [items, setItems] = useState<MeasurementDraft[]>([emptyMeasurement()]);
  const [photos, setPhotos] = useState<CrmVisitPhoto[]>([]);
  const [siteConditions, setSiteConditions] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const reportQuery = useQuery({
    queryKey: ["crm", "visit-report", appointmentId],
    queryFn: () => fetchCrmVisitReport(appointmentId as string),
    enabled: open && Boolean(appointmentId),
  });

  const report = reportQuery.data;

  // Named in the no-location warning. The notice below fetches the same key.
  const fieldCamera = useFieldCamera({ enabled: open });
  const cameraApp = fieldCamera.data?.data.appName ?? DEFAULT_FIELD_CAMERA_APP;

  useEffect(() => {
    if (!report) return;
    setChecklist(report.checklist ?? buildDefaultChecklist());
    setPhotos(report.photos);
    setSiteConditions(report.siteConditions ?? "");
    setReportNotes(report.reportNotes ?? "");
    setItems(
      report.visitItems.length > 0
        ? report.visitItems.map((item) => ({
            category: item.category ?? "",
            description: item.description,
            quantity: String(item.quantity),
            unit: item.unit ?? "pcs",
            widthMm: item.widthMm != null ? String(item.widthMm) : "",
            heightMm: item.heightMm != null ? String(item.heightMm) : "",
            depthMm: item.depthMm != null ? String(item.depthMm) : "",
            specNotes: item.specNotes ?? "",
            unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
          }))
        : [emptyMeasurement()],
    );
    setErrors([]);
  }, [report]);

  const buildPayload = (markCompleted: boolean) => ({
    checklist,
    photos,
    siteConditions: siteConditions.trim() || null,
    reportNotes: reportNotes.trim() || null,
    items: items
      .filter((item) => item.description.trim() && Number(item.quantity) > 0)
      .map((item) => ({
        category: item.category.trim() || null,
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unit: item.unit.trim() || null,
        widthMm: optionalNumber(item.widthMm),
        heightMm: optionalNumber(item.heightMm),
        depthMm: optionalNumber(item.depthMm),
        specNotes: item.specNotes.trim() || null,
        unitPrice: optionalNumber(item.unitPrice),
      })),
    markCompleted,
  });

  const save = useMutation({
    mutationFn: (markCompleted: boolean) =>
      saveCrmVisitReport(appointmentId as string, buildPayload(markCompleted)).then(
        () => markCompleted,
      ),
    onSuccess: (markCompleted) => {
      queryClient.invalidateQueries({ queryKey: ["crm", "visit-report", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["crm-lead"] });
      queryClient.invalidateQueries({ queryKey: ["crm", "appointments"] });
      if (markCompleted) {
        toast({ title: "Site visit completed" });
        onOpenChange(false);
        onCompleted?.(items.filter((item) => item.description.trim()));
      } else {
        toast({ title: "Report saved" });
      }
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    const uploaded: CrmVisitPhoto[] = [];
    try {
      for (const file of files) {
        // Read here, on the phone, before the file leaves it: the photo's own
        // metadata is the only witness to where and when it was taken.
        const geotag = await readPhotoGeotag(file);
        const body = new FormData();
        body.append("file", file);
        // The upload answers with the stored file itself — no `data` envelope.
        // This sheet used to read `result.data.url`, which threw on every
        // upload and surfaced as "Upload failed" for a file that had arrived.
        const stored = await fetchJson<{
          url: string;
          pathname: string;
          contentType: string;
          size: number;
        }>("/api/v2/crm/uploads", { method: "POST", body });
        uploaded.push({
          clientPhotoId: newClientPhotoId(),
          url: stored.url,
          pathname: stored.pathname,
          fileName: file.name,
          contentType: stored.contentType,
          size: stored.size,
          caption: null,
          ...geotag,
        });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      // Whatever reached storage is kept, even when a later file failed —
      // the rep should not have to upload the first five photos again.
      if (uploaded.length > 0) setPhotos((current) => [...current, ...uploaded]);
      setUploading(false);
    }

    // Accepted, and said out loud. Refusing the photo would lose the picture
    // of the damage over the camera app, which is the worse of the two.
    const unlocated = uploaded.filter(
      (photo) =>
        isPhoto(photo) &&
        !hasLocation({ latitude: photo.latitude ?? null, longitude: photo.longitude ?? null }),
    ).length;
    if (unlocated > 0) {
      toast({
        title: `${unlocated} photo${unlocated === 1 ? " has" : "s have"} no location`,
        description: `Added anyway. Retake ${unlocated === 1 ? "it" : "them"} with ${cameraApp} if you can, so the report shows where ${unlocated === 1 ? "it was" : "they were"} taken.`,
        variant: "warning",
      });
    }
  };

  const patchItem = (index: number, patch: Partial<MeasurementDraft>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const validateForCompletion = (): string[] => {
    const found: string[] = [];
    const measured = items.filter((item) => item.description.trim());
    if (measured.length === 0 && !reportNotes.trim()) {
      found.push(
        "Record what you found — at least one measurement or a note about the visit.",
      );
    }
    if (items.some((item) => item.description.trim() && !(Number(item.quantity) > 0))) {
      found.push("Every measured item needs a quantity above zero.");
    }
    return found;
  };

  const isLoading = reportQuery.isLoading;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Site visit report${appointmentNo ? ` · ${appointmentNo}` : ""}`}
      description="Everything captured here feeds the quotation — measure once, quote from it."
      size="xl"
      errors={isLoading ? undefined : errors}
      onSubmit={
        isLoading
          ? undefined
          : (event) => {
              event.preventDefault();
              const found = validateForCompletion();
              setErrors(found);
              if (found.length === 0) save.mutate(true);
            }
      }
      footer={
        isLoading ? null : (
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                setErrors([]);
                save.mutate(false);
              }}
            >
              Save draft
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Complete visit"}
            </Button>
          </>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* What is actually being quoted, and that product's own questions.
              The generic checklist below stays for the visit as a whole: it
              asks whether the rep got access and took photographs, which is
              true of every visit regardless of what is being priced. */}
          <section className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">
              Site visit questions
            </h3>
            {appointmentId ? <VisitQuestionSections appointmentId={appointmentId} /> : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">
              On-site checklist
            </h3>
            <Stack as="ul" gap="xs">
              {checklist.map((entry, index) => (
                <li key={entry.key} className="space-y-1.5 p-2.5">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={entry.checked}
                      onCheckedChange={(checked) =>
                        setChecklist((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, checked: checked === true } : item,
                          ),
                        )
                      }
                    />
                    <span>{entry.label}</span>
                  </label>
                  {entry.checked ? null : (
                    <Input
                      value={entry.notes ?? ""}
                      onChange={(event) =>
                        setChecklist((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, notes: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Why not? (optional)"
                      className="h-8 text-sm"
                      aria-label={`Note for ${entry.label}`}
                    />
                  )}
                </li>
              ))}
            </Stack>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold text-[var(--text-strong)]">
              Measurements & specifications
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              Each row becomes a quotation line. Prices are optional — leave them blank to
              price up back at the office.
            </p>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-[var(--card-radius)] border border-[var(--border)] p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_2rem]">
                    <Input
                      value={item.category}
                      onChange={(event) => patchItem(index, { category: event.target.value })}
                      placeholder="Category"
                      aria-label={`Item ${index + 1} category`}
                      maxLength={80}
                    />
                    {/* The same picker the quote builder uses. These
                        descriptions become quotation lines verbatim, so this
                        is where "aluminium sliding window" first gets typed
                        three different ways at three remembered prices —
                        which is exactly what the catalogue exists to stop.
                        Free text still works: a visit finds things nobody
                        has ever sold before. */}
                    <CataloguePicker
                      value={item.description}
                      onChange={(value) => patchItem(index, { description: value })}
                      aria-label={`Item ${index + 1} description`}
                      onPick={(pick) =>
                        patchItem(index, {
                          description: pick.description,
                          // Only fills a price nobody has typed. Somebody who
                          // has already priced this line measured it on site
                          // and knows something the list does not.
                          ...(item.unitPrice.trim() || pick.unitPrice == null
                            ? {}
                            : { unitPrice: pick.unitPrice.toFixed(2) }),
                        })
                      }
                      placeholder="What is it? e.g. Aluminium sliding window"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 px-0"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <div className="space-y-1">
                      <Label className="text-sm">Qty</Label>
                      <Input
                        value={item.quantity}
                        onChange={(event) =>
                          patchItem(index, { quantity: event.target.value })
                        }
                        inputMode="decimal"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Unit</Label>
                      <Input
                        value={item.unit}
                        onChange={(event) => patchItem(index, { unit: event.target.value })}
                        list="crm-visit-units"
                        maxLength={20}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Width mm</Label>
                      <Input
                        value={item.widthMm}
                        onChange={(event) => patchItem(index, { widthMm: event.target.value })}
                        inputMode="decimal"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Height mm</Label>
                      <Input
                        value={item.heightMm}
                        onChange={(event) =>
                          patchItem(index, { heightMm: event.target.value })
                        }
                        inputMode="decimal"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Depth mm</Label>
                      <Input
                        value={item.depthMm}
                        onChange={(event) => patchItem(index, { depthMm: event.target.value })}
                        inputMode="decimal"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Est. price</Label>
                      <Input
                        value={item.unitPrice}
                        onChange={(event) =>
                          patchItem(index, { unitPrice: event.target.value })
                        }
                        inputMode="decimal"
                        className="font-mono"
                        placeholder="—"
                      />
                    </div>
                  </div>

                  <Input
                    value={item.specNotes}
                    onChange={(event) => patchItem(index, { specNotes: event.target.value })}
                    placeholder="Material, finish, glass type, colour…"
                    aria-label={`Item ${index + 1} specification notes`}
                    maxLength={500}
                  />
                </div>
              ))}
            </div>

            <datalist id="crm-visit-units">
              {UNITS.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setItems((current) => [...current, emptyMeasurement()])}
              >
                <Plus className="h-3.5 w-3.5" />
                Add item
              </Button>
              {items.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItems((current) => [...current, { ...current[current.length - 1] }])
                  }
                >
                  Duplicate last
                </Button>
              ) : null}
            </div>
          </section>

          {/* Said again where the photos go in: the list page says it before
              the visit, this says it at the moment of choosing the files. */}
          <GeotagNotice />

          {/* The DS attachment pattern: one dropzone, one list, remove per
              row. The caption rides in each row's description slot — it's
              the one field a site photo needs that a generic file doesn't —
              and the meta line says where and when the camera says it was. */}
          <AttachmentCenter
            title="Photos & files"
            files={[
              ...photos.map((photo, index) => ({
                id: photo.clientPhotoId,
                name: photo.fileName ?? (isPhoto(photo) ? "Photo" : "File"),
                href: photo.url,
                icon: isPhoto(photo) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url}
                    alt={photo.caption ?? photo.fileName ?? "Site photo"}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <FileText aria-hidden="true" className="h-4 w-4" />
                ),
                meta: <PhotoProvenance photo={photo} />,
                description: (
                  <Input
                    value={photo.caption ?? ""}
                    onChange={(event) =>
                      setPhotos((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, caption: event.target.value } : entry,
                        ),
                      )
                    }
                    placeholder="Caption"
                    className="mt-1 h-7 text-sm"
                    aria-label={`Caption for ${photo.fileName ?? "photo"}`}
                  />
                ),
              })),
              ...(uploading
                ? [{ id: "__uploading__", name: "Uploading…", progress: 50 }]
                : []),
            ]}
            onUpload={(fileList) => {
              const files = Array.from(fileList);
              if (files.length > 0) void uploadFiles(files);
            }}
            onRemove={(id) =>
              setPhotos((current) => current.filter((photo) => photo.clientPhotoId !== id))
            }
            accept="image/*,application/pdf"
            multiple
            dropLabel="Add photos of every work area"
            dropHint="Images and PDFs"
            emptyLabel="No photos yet."
          />

          <section className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-conditions">Site conditions</Label>
              <Textarea
                id="site-conditions"
                value={siteConditions}
                onChange={(event) => setSiteConditions(event.target.value)}
                rows={3}
                placeholder="Access, power and water, terrain, obstructions, anything that affects the price or the schedule."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-notes">Findings</Label>
              <Textarea
                id="report-notes"
                value={reportNotes}
                onChange={(event) => setReportNotes(event.target.value)}
                rows={3}
                placeholder="What you found, what the client asked for, what you promised."
              />
            </div>
          </section>
        </div>
      )}
    </RecordDialog>
  );
}
