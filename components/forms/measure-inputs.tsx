"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Camera, Minus, Plus, Trash2, Warning } from "@/lib/icons";
import { formatMeasure, measureOf, measureWarning, type FieldDefinition } from "@/lib/forms/fields";

import styles from "./forms.module.css";

/**
 * The measuring and capturing questions, as a rep on site meets them.
 *
 * A figure and its unit are one control: the unit is part of the question,
 * never something to type. Figures are kept as typed — converting on every
 * keystroke eats "1." — and coerced where the answer is checked. Anything
 * worked out from them (an area, a total) is shown, read-only, beside them.
 */

type Aria = { "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean };

const asText = (value: unknown) => (typeof value === "number" || typeof value === "string" ? String(value) : "");

/** A number and its unit. */
export function Figure({
  id,
  value,
  unit,
  onChange,
  label,
  aria,
  size = "md",
}: {
  id?: string;
  value: unknown;
  unit?: string;
  onChange: (next: string) => void;
  label?: string;
  aria?: Aria;
  size?: "md" | "sm";
}) {
  return (
    <span className={styles.measure} data-size={size}>
      <input
        id={id}
        className={styles.measureInput}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={asText(value)}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        {...aria}
      />
      {unit ? (
        <span className={styles.measureUnit} aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </span>
  );
}

/** What a figure comes to, and any warning the question gives about it. */
function Outcome({ field, value, total }: { field: FieldDefinition; value: unknown; total?: string }) {
  const warning = measureWarning(field, value);
  return (
    <>
      {total ? <p className={styles.measureTotal}>{total}</p> : null}
      {warning ? (
        <p className={styles.measureWarning} role="status">
          <Warning className="size-3.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      ) : null}
    </>
  );
}

export function LengthInput({ field, id, value, set, aria }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void; aria: Aria }) {
  return (
    <>
      <Figure id={id} value={value} unit={field.type === "count" ? undefined : field.unit} onChange={set} aria={aria} />
      <Outcome field={field} value={value} />
    </>
  );
}

/** Steps by one; typed for more. */
export function CountInput({ field, id, value, set, aria }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void; aria: Aria }) {
  const current = Number(asText(value)) || 0;
  return (
    <>
      <span className={styles.count}>
        <button type="button" className={styles.countStep} aria-label={`One fewer ${field.label.toLowerCase()}`} onClick={() => set(String(Math.max(0, current - 1)))}>
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <input id={id} className={styles.countValue} type="text" inputMode="numeric" value={asText(value)} onChange={(event) => set(event.target.value)} {...aria} />
        <button type="button" className={styles.countStep} aria-label={`One more ${field.label.toLowerCase()}`} onClick={() => set(String(current + 1))}>
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </span>
      <Outcome field={field} value={value} />
    </>
  );
}

type Area = { length?: unknown; width?: unknown; area?: unknown };

export function AreaInput({ field, id, value, set, aria }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void; aria: Aria }) {
  const area = (value && typeof value === "object" ? value : {}) as Area;
  const total = measureOf(field, value);
  if (field.shape === "total") {
    return (
      <>
        <Figure id={id} value={area.area} unit={`${field.unit ?? "m"}²`} onChange={(next) => set({ area: next })} aria={aria} />
        <Outcome field={field} value={value} />
      </>
    );
  }
  return (
    <>
      <span className={styles.area}>
        <Figure id={id} label={`${field.label}: length`} value={area.length} unit={field.unit} onChange={(next) => set({ ...area, length: next })} aria={aria} />
        <span className={styles.areaTimes} aria-hidden="true">×</span>
        <Figure label={`${field.label}: width`} value={area.width} unit={field.unit} onChange={(next) => set({ ...area, width: next })} />
      </span>
      <Outcome field={field} value={value} total={total !== null ? `= ${formatMeasure(field, total)}` : undefined} />
    </>
  );
}

type Room = { name: string; length: unknown; width: unknown; note?: string };

/** Areas measured one by one as the rep walks the floor, adding up as they go. */
export function AreasInput({ field, id, value, set, aria }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void; aria: Aria }) {
  const rooms = Array.isArray(value) ? (value as Room[]) : [];
  const total = measureOf(field, rooms);
  const update = (index: number, patch: Partial<Room>) => set(rooms.map((room, at) => (at === index ? { ...room, ...patch } : room)));
  const unit = field.unit ?? "m";
  return (
    <div id={id} role="group" aria-label={field.label} className={styles.areas} {...aria}>
      {rooms.length === 0 ? <p className={styles.areasEmpty}>No areas yet. Add the first as you walk in.</p> : null}
      {rooms.map((room, index) => {
        const area = measureOf({ ...field, type: "area", shape: "rect" }, room);
        return (
          <div key={index} className={styles.areaRow}>
            <Input
              className={styles.areaName}
              value={room.name}
              placeholder={`Area ${index + 1}`}
              aria-label={`Area ${index + 1}: name`}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <span className={styles.area}>
              <Figure label={`${room.name || `Area ${index + 1}`}: length`} value={room.length} unit={unit} size="sm" onChange={(next) => update(index, { length: next })} />
              <span className={styles.areaTimes} aria-hidden="true">×</span>
              <Figure label={`${room.name || `Area ${index + 1}`}: width`} value={room.width} unit={unit} size="sm" onChange={(next) => update(index, { width: next })} />
            </span>
            <span className={styles.areaFigure}>{area !== null ? formatMeasure({ ...field, type: "area" }, area) : "—"}</span>
            <button type="button" className={styles.areaRemove} aria-label={`Remove ${room.name || `area ${index + 1}`}`} onClick={() => set(rooms.filter((_, at) => at !== index))}>
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <div className={styles.areasFoot}>
        <button type="button" className={styles.addLine} onClick={() => set([...rooms, { name: "", length: "", width: "" }])}>
          <Plus className="size-4" aria-hidden="true" />
          Add an area
        </button>
        {rooms.length ? (
          <span className={styles.measureTotal}>
            {rooms.length} {rooms.length === 1 ? "area" : "areas"} · <b>{formatMeasure({ ...field, type: "areas" }, total ?? 0)}</b>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Several lengths along several walls, one total. */
export function RunInput({ field, id, value, set, aria }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void; aria: Aria }) {
  const parts = Array.isArray(value) ? (value as unknown[]) : [];
  const total = measureOf(field, parts);
  return (
    <div id={id} role="group" aria-label={field.label} className={styles.run} {...aria}>
      {parts.map((part, index) => (
        <span key={index} className={styles.runPart}>
          {index > 0 ? <span className={styles.areaTimes} aria-hidden="true">+</span> : null}
          <Figure
            label={`${field.label}: length ${index + 1}`}
            value={part}
            unit={field.unit}
            size="sm"
            onChange={(next) => set(parts.map((existing, at) => (at === index ? next : existing)))}
          />
        </span>
      ))}
      <button type="button" className={styles.runAdd} aria-label={`Add a length to ${field.label.toLowerCase()}`} onClick={() => set([...parts, ""])}>
        <Plus className="size-4" aria-hidden="true" />
      </button>
      {parts.length > 1 && total !== null ? <span className={styles.measureTotal}>= {formatMeasure(field, total)}</span> : null}
    </div>
  );
}

/** Photos, uploaded as they are taken. */
export function PhotosInput({ field, id, value, set, uploadUrl }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void; uploadUrl?: string }) {
  const photos = Array.isArray(value) ? (value as string[]) : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.photos}>
      {photos.map((url) => (
        <span key={url} className={styles.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded photo at its own address */}
          <img src={url} alt="" />
          {uploadUrl ? (
            <button type="button" className={styles.photoRemove} aria-label="Remove this photo" onClick={() => set(photos.filter((photo) => photo !== url))}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ))}
      <label className={styles.photoAdd} aria-disabled={!uploadUrl || busy}>
        <Camera className="size-5" aria-hidden="true" />
        <span className="sr-only">Add a photo to {field.label}</span>
        <input
          id={id}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          disabled={!uploadUrl || busy}
          className="sr-only"
          onChange={async (event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (!files.length || !uploadUrl) return;
            setBusy(true);
            setError(null);
            try {
              const added: string[] = [];
              for (const file of files) {
                const body = new FormData();
                body.append("file", file);
                const response = await fetch(uploadUrl, { method: "POST", body });
                const payload = (await response.json()) as { url?: string; data?: { url?: string }; error?: string };
                const url = payload.url ?? payload.data?.url;
                if (!response.ok || !url) throw new Error(payload.error ?? "Upload failed");
                added.push(url);
              }
              set([...photos, ...added]);
            } catch (uploadError) {
              setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy ? <p className={styles.help}>Uploading…</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Signature = { name: string; signedAt: string; image: string };

/** Drawn with a finger, named, and timed when it is finished. */
export function SignatureInput({ field, id, value, set }: { field: FieldDefinition; id: string; value: unknown; set: (next: unknown) => void }) {
  const signed = value && typeof value === "object" ? (value as Signature) : null;
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [name, setName] = useState(signed?.name ?? "");
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = getComputedStyle(canvas.current!).color;
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * event.currentTarget.width, ((event.clientY - box.top) / box.height) * event.currentTarget.height] as const;
  };

  if (signed?.image) {
    return (
      <div className={styles.signature}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the signature as drawn */}
        <img src={signed.image} alt={`Signature of ${signed.name}`} className={styles.signatureImage} />
        <p className={styles.help}>
          {signed.name} · {new Date(signed.signedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {" · "}
          <button type="button" className={styles.fileRemove} onClick={() => set(null)}>
            Sign again
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.signature}>
      <canvas
        id={id}
        ref={canvas}
        width={600}
        height={160}
        className={styles.signaturePad}
        aria-label={`${field.label}: sign here`}
        onPointerDown={(event) => {
          drawing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const context = event.currentTarget.getContext("2d");
          const [x, y] = point(event);
          context?.beginPath();
          context?.moveTo(x, y);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const context = event.currentTarget.getContext("2d");
          const [x, y] = point(event);
          context?.lineTo(x, y);
          context?.stroke();
          setMarked(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
      <span className={styles.signatureFoot}>
        <Input value={name} placeholder="Who is signing" aria-label="Who is signing" onChange={(event) => setName(event.target.value)} />
        <button
          type="button"
          className={styles.addLine}
          disabled={!marked || !name.trim()}
          onClick={() => set({ name: name.trim(), signedAt: new Date().toISOString(), image: canvas.current!.toDataURL("image/png") })}
        >
          Done
        </button>
      </span>
    </div>
  );
}
