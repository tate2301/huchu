"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Camera, NVR, Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CCTVSection, CCTVSurface } from "@/components/cctv/cctv-surfaces";
import { useToast } from "@/components/ui/use-toast";

type CameraFormProps = {
  mode: "create" | "edit";
  sites: Site[];
  nvrs: NVR[];
  initialValue?: Partial<Camera> | null;
};

export function CameraForm({ mode, sites, nvrs, initialValue }: CameraFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialValue?.name || "");
  const [siteId, setSiteId] = useState(initialValue?.siteId || "");
  const [nvrId, setNvrId] = useState(initialValue?.nvrId || "");
  const [channelNumber, setChannelNumber] = useState(String(initialValue?.channelNumber ?? 1));
  const [area, setArea] = useState(initialValue?.area || "");
  const [description, setDescription] = useState(initialValue?.description || "");
  const [hasPTZ, setHasPTZ] = useState(String(initialValue?.hasPTZ ?? false));
  const [hasAudio, setHasAudio] = useState(String(initialValue?.hasAudio ?? false));
  const [hasMotionDetect, setHasMotionDetect] = useState(String(initialValue?.hasMotionDetect ?? true));
  const [isHighSecurity, setIsHighSecurity] = useState(String(initialValue?.isHighSecurity ?? false));
  const [isOnline, setIsOnline] = useState(String(initialValue?.isOnline ?? false));
  const [isRecording, setIsRecording] = useState(String(initialValue?.isRecording ?? true));
  const [formError, setFormError] = useState<string | null>(null);

  const cameraId = initialValue?.id;
  const isEditMode = mode === "edit" && Boolean(cameraId);

  const nvrsBySite = useMemo(
    () => nvrs.filter((nvr) => nvr.isActive && (siteId ? nvr.siteId === siteId : true)),
    [nvrs, siteId],
  );

  const selectedSite = sites.find((site) => site.id === siteId);
  const selectedNvr = nvrs.find((nvr) => nvr.id === nvrId);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        siteId,
        nvrId,
        channelNumber: Number(channelNumber),
        area: area.trim(),
        description: description.trim() || undefined,
        hasPTZ: hasPTZ === "true",
        hasAudio: hasAudio === "true",
        hasMotionDetect: hasMotionDetect === "true",
        isHighSecurity: isHighSecurity === "true",
        isOnline: isOnline === "true",
        isRecording: isRecording === "true",
      };

      if (isEditMode) {
        return fetchJson<Camera>(`/api/cctv/cameras/${cameraId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return fetchJson<Camera>("/api/cctv/cameras", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (record) => {
      const params = new URLSearchParams();
      params.set("createdId", record.id);
      params.set("source", isEditMode ? "cctv-camera-update" : "cctv-camera");
      params.set("createdAt", record.createdAt || new Date().toISOString());
      router.push(`/cctv/cameras?${params.toString()}`);
      toast({
        title: isEditMode ? "Camera updated" : "Camera registered",
        description: isEditMode
          ? "Camera details were updated successfully."
          : "Camera has been added to CCTV monitoring.",
      });
    },
    onError: (error) => {
      const message = getApiErrorMessage(error);
      setFormError(message);
      toast({
        title: isEditMode ? "Unable to update camera" : "Unable to register camera",
        description: message,
        variant: "destructive",
      });
    },
  });

  const pageTitle = useMemo(
    () => (isEditMode ? "Edit Camera" : "Register Camera"),
    [isEditMode],
  );

  const onSubmit = () => {
    setFormError(null);
    if (!name.trim() || !siteId || !nvrId || !area.trim()) {
      setFormError("Name, site, NVR, and area are required.");
      return;
    }
    const parsedChannel = Number(channelNumber);
    if (!Number.isInteger(parsedChannel) || parsedChannel <= 0) {
      setFormError("Channel number must be a positive whole number.");
      return;
    }
    submitMutation.mutate();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {formError ? (
          <Alert variant="destructive">
            <AlertTitle>Fix required fields</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <CCTVSurface className="p-5">
          <CCTVSection
            title={pageTitle}
            description="Capture the camera identity, site assignment, and recorder mapping."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Camera name</label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Main Gate Camera 1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Site</label>
                <Select
                  value={siteId}
                  onValueChange={(value) => {
                    setSiteId(value);
                    if (nvrId && !nvrs.some((nvr) => nvr.id === nvrId && nvr.siteId === value)) {
                      setNvrId("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recorder</label>
                <Select value={nvrId} onValueChange={setNvrId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select NVR" />
                  </SelectTrigger>
                  <SelectContent>
                    {nvrsBySite.map((nvr) => (
                      <SelectItem key={nvr.id} value={nvr.id}>
                        {nvr.name} ({nvr.ipAddress})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Channel number</label>
                <Input
                  type="number"
                  value={channelNumber}
                  onChange={(event) => setChannelNumber(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Area</label>
                <Input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Gate" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Overview of the monitored zone"
                />
              </div>
            </div>
          </CCTVSection>
        </CCTVSurface>

        <CCTVSurface className="p-5">
          <CCTVSection
            title="Operational state"
            description="Keep the camera aligned to the current monitoring and recording posture."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">High security</label>
                <Select value={isHighSecurity} onValueChange={setIsHighSecurity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Online status</label>
                <Select value={isOnline} onValueChange={setIsOnline}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Online</SelectItem>
                    <SelectItem value="false">Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Recording status</label>
                <Select value={isRecording} onValueChange={setIsRecording}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Recording</SelectItem>
                    <SelectItem value="false">Not recording</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CCTVSection>
        </CCTVSurface>

        <CCTVSurface className="p-5">
          <details className="group">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Optional device settings
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Additional fields stay tucked away so the main setup flow stays simple.
                  </div>
                </div>
                <span className="text-sm text-muted-foreground group-open:hidden">Show</span>
                <span className="hidden text-sm text-muted-foreground group-open:inline">Hide</span>
              </div>
            </summary>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">PTZ</label>
                <Select value={hasPTZ} onValueChange={setHasPTZ}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Audio</label>
                <Select value={hasAudio} onValueChange={setHasAudio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Motion detection</label>
                <Select value={hasMotionDetect} onValueChange={setHasMotionDetect}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </details>
        </CCTVSurface>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSubmit} disabled={submitMutation.isPending}>
            {submitMutation.isPending
              ? isEditMode
                ? "Saving..."
                : "Registering..."
              : isEditMode
                ? "Save Changes"
                : "Register Camera"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/cctv/cameras")}>
            Cancel
          </Button>
          <p className="text-xs text-muted-foreground">Required: name, site, NVR, channel number, area.</p>
        </div>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 self-start">
        <CCTVSurface className="p-4">
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Setup summary
              </div>
              <div className="mt-1 text-lg font-semibold">
                {isEditMode ? "Editing camera" : "New camera"}
              </div>
            </div>

            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Site</span>
                <span>{selectedSite?.name || "Unselected"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Recorder</span>
                <span>{selectedNvr?.name || "Unselected"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Channel</span>
                <span className="tabular-nums">{channelNumber || "-"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-muted-foreground">Security</span>
                <span>{isHighSecurity === "true" ? "High security" : "Standard"}</span>
              </div>
            </div>
          </div>
        </CCTVSurface>

        <CCTVSurface className="p-4">
          <div className="space-y-3 text-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Field hints
            </div>
            <ul className="space-y-2 text-muted-foreground">
              <li>Pick the site before the recorder so the channel list stays consistent.</li>
              <li>Use the sub stream for grid monitoring and the main stream for focused review.</li>
              <li>Optional device settings stay tucked away to keep the main workflow clean.</li>
            </ul>
          </div>
        </CCTVSurface>
      </aside>
    </div>
  );
}
