"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { NVR, Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type NVRFormProps = {
  mode: "create" | "edit";
  sites: Site[];
  initialValue?: Partial<NVR> | null;
};

export function NVRForm({ mode, sites, initialValue }: NVRFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialValue?.name || "");
  const [siteId, setSiteId] = useState(initialValue?.siteId || "");
  const [ipAddress, setIpAddress] = useState(initialValue?.ipAddress || "");
  const [port, setPort] = useState(String(initialValue?.port ?? 554));
  const [httpPort, setHttpPort] = useState(String(initialValue?.httpPort ?? 80));
  const [rtspPort, setRtspPort] = useState(String(initialValue?.rtspPort ?? 554));
  const [username, setUsername] = useState(initialValue?.username || "");
  const [password, setPassword] = useState("");
  const [manufacturer, setManufacturer] = useState(initialValue?.manufacturer || "Hikvision");
  const [model, setModel] = useState(initialValue?.model || "");
  const [firmware, setFirmware] = useState(initialValue?.firmware || "");
  const [isapiEnabled, setIsapiEnabled] = useState(String(initialValue?.isapiEnabled ?? true));
  const [onvifEnabled, setOnvifEnabled] = useState(String(initialValue?.onvifEnabled ?? false));
  const [isOnline, setIsOnline] = useState(String(initialValue?.isOnline ?? false));
  const [formError, setFormError] = useState<string | null>(null);

  const nvrId = initialValue?.id;
  const isEditMode = mode === "edit" && Boolean(nvrId);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const parsedPort = Number(port);
      const parsedHttpPort = Number(httpPort);
      const parsedRtspPort = Number(rtspPort);

      const payload = {
        name: name.trim(),
        siteId,
        ipAddress: ipAddress.trim(),
        port: parsedPort,
        httpPort: parsedHttpPort,
        rtspPort: parsedRtspPort,
        username: username.trim(),
        password: password.trim() || undefined,
        manufacturer: manufacturer.trim() || "Hikvision",
        model: model.trim() || undefined,
        firmware: firmware.trim() || undefined,
        isapiEnabled: isapiEnabled === "true",
        onvifEnabled: onvifEnabled === "true",
        isOnline: isOnline === "true",
      };

      if (isEditMode) {
        return fetchJson<NVR>(`/api/cctv/nvrs/${nvrId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      return fetchJson<NVR>("/api/cctv/nvrs", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          password: payload.password,
        }),
      });
    },
    onSuccess: (record) => {
      const params = new URLSearchParams();
      params.set("createdId", record.id);
      params.set("source", isEditMode ? "cctv-nvr-update" : "cctv-nvr");
      params.set("createdAt", record.createdAt || new Date().toISOString());
      router.push(`/cctv/nvrs?${params.toString()}`);
      toast({
        title: isEditMode ? "NVR updated" : "NVR created",
        description: isEditMode
          ? "Recorder details were updated successfully."
          : "Recorder has been registered successfully.",
      });
    },
    onError: (error) => {
      const message = getApiErrorMessage(error);
      setFormError(message);
      toast({
        title: isEditMode ? "Unable to update NVR" : "Unable to create NVR",
        description: message,
        variant: "destructive",
      });
    },
  });

  const pageTitle = useMemo(
    () => (isEditMode ? "Edit NVR" : "Register NVR"),
    [isEditMode],
  );

  const onSubmit = () => {
    setFormError(null);
    if (!name.trim() || !siteId || !ipAddress.trim() || !username.trim()) {
      setFormError("Name, site, IP address, and username are required.");
      return;
    }
    if (!isEditMode && !password.trim()) {
      setFormError("Password is required when registering a new NVR.");
      return;
    }
    submitMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{pageTitle}</CardTitle>
        <CardDescription>
          Fill in recorder details and connection settings. Required fields must be completed.
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
            <label className="text-sm font-medium">NVR Name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Main Gate NVR" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Site</label>
            <Select value={siteId} onValueChange={setSiteId}>
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
            <label className="text-sm font-medium">IP Address</label>
            <Input value={ipAddress} onChange={(event) => setIpAddress(event.target.value)} placeholder="192.168.1.100" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Manufacturer</label>
            <Input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} placeholder="Hikvision" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="DS-76xx" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Firmware</label>
            <Input value={firmware} onChange={(event) => setFirmware(event.target.value)} placeholder="v5.x" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">RTSP Port</label>
            <Input type="number" value={rtspPort} onChange={(event) => setRtspPort(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">HTTP Port</label>
            <Input type="number" value={httpPort} onChange={(event) => setHttpPort(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Service Port</label>
            <Input type="number" value={port} onChange={(event) => setPort(event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Username</label>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="viewer" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Password {isEditMode ? "(leave blank to keep current)" : ""}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isEditMode ? "********" : "Secure password"}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">ISAPI Enabled</label>
            <Select value={isapiEnabled} onValueChange={setIsapiEnabled}>
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
            <label className="text-sm font-medium">ONVIF Enabled</label>
            <Select value={onvifEnabled} onValueChange={setOnvifEnabled}>
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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onSubmit} disabled={submitMutation.isPending}>
            {submitMutation.isPending
              ? isEditMode
                ? "Saving..."
                : "Registering..."
              : isEditMode
                ? "Save Changes"
                : "Register NVR"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/cctv/nvrs")}>
            Cancel
          </Button>
          <p className="text-xs text-muted-foreground">Required: name, site, IP address, username, password.</p>
        </div>
      </CardContent>
    </Card>
  );
}
