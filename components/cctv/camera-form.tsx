"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Camera, NVR, Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [hasLineDetect, setHasLineDetect] = useState(String(initialValue?.hasLineDetect ?? false));
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
        hasLineDetect: hasLineDetect === "true",
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
    <Card>
      <CardHeader>
        <CardTitle>{pageTitle}</CardTitle>
        <CardDescription>
          Configure camera details, capabilities, and stream source mapping.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {formError ? (
          <Alert variant="destructive">
            <AlertTitle>Fix required fields</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Camera Name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Main Gate Camera 1" />
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
            <label className="text-sm font-medium">NVR</label>
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
            <label className="text-sm font-medium">Channel Number</label>
            <Input type="number" value={channelNumber} onChange={(event) => setChannelNumber(event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Area</label>
            <Input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Gate" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Overview of the monitored zone"
            />
          </div>

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
            <label className="text-sm font-medium">Motion Detection</label>
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Line Detection</label>
            <Select value={hasLineDetect} onValueChange={setHasLineDetect}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">High Security</label>
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
            <label className="text-sm font-medium">Online Status</label>
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
            <label className="text-sm font-medium">Recording Status</label>
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
      </CardContent>
    </Card>
  );
}
