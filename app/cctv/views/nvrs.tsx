"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Nvr as NvrIcon } from "@/lib/icons";
import { Camera, fetchCameras, fetchNVRs, NVR, Site } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMenu } from "@/components/ui/export-menu";
import { Input } from "@/components/ui/input";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusState } from "@/components/shared/status-state";
import { PageIntro } from "@/components/shared/page-intro";
import {
  CCTVSection,
  CCTVStat,
  CCTVSurface,
} from "@/components/cctv/cctv-surfaces";
import { useToast } from "@/components/ui/use-toast";

interface NVRsViewProps {
  sites: Site[];
  selectedSiteId: string;
  onSiteChange: (siteId: string) => void;
  createdId?: string | null;
}

function formatHeartbeat(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "No recent check";
}

type NVRModalSection = "general" | "network" | "protocols" | "cameras";

type NVRSettingsModalProps = {
  nvr: NVR | null;
  sites: Site[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NVRsView({
  sites,
  selectedSiteId,
  onSiteChange,
  createdId,
}: NVRsViewProps) {
  const nvrsPdfRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedNvrId, setSelectedNvrId] = useState<string>("");
  const [settingsNvrId, setSettingsNvrId] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const siteFilterId = "cctv-nvrs-site-filter";
  const statusFilterId = "cctv-nvrs-status-filter";

  const { data, isLoading, error } = useQuery({
    queryKey: ["nvrs", selectedSiteId, statusFilter],
    queryFn: () =>
      fetchNVRs({
        siteId: selectedSiteId || undefined,
        isOnline:
          statusFilter === "online"
            ? true
            : statusFilter === "offline"
              ? false
              : undefined,
      }),
  });

  const nvrs = useMemo(() => data?.data ?? [], [data?.data]);
  const activeSiteName =
    sites.find((site) => site.id === selectedSiteId)?.name || "All Sites";
  const onlineCount = nvrs.filter((nvr) => nvr.isOnline).length;
  const offlineCount = nvrs.filter((nvr) => !nvr.isOnline).length;
  const cameraCount = nvrs.reduce(
    (count, nvr) => count + (nvr._count?.cameras || 0),
    0,
  );
  const exportDisabled = isLoading || nvrs.length === 0;

  const filteredNvrs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return nvrs;

    return nvrs.filter((nvr) => {
      const haystack = [
        nvr.name,
        nvr.site?.name,
        nvr.manufacturer,
        nvr.model,
        nvr.firmware,
        nvr.ipAddress,
        nvr.port,
        nvr.httpPort,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [nvrs, searchTerm]);

  const selectedNvr = useMemo(() => {
    if (!filteredNvrs.length) return null;

    const selected =
      filteredNvrs.find((nvr) => nvr.id === selectedNvrId) ||
      filteredNvrs.find((nvr) => nvr.id === createdId) ||
      filteredNvrs[0] ||
      null;

    return selected;
  }, [createdId, filteredNvrs, selectedNvrId]);

  const settingsNvr = useMemo(
    () =>
      filteredNvrs.find((nvr) => nvr.id === settingsNvrId) ??
      nvrs.find((nvr) => nvr.id === settingsNvrId) ??
      null,
    [filteredNvrs, nvrs, settingsNvrId],
  );

  const deactivateMutation = useMutation({
    mutationFn: async (nvrId: string) =>
      fetchJson(`/api/cctv/nvrs/${nvrId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nvrs"] });
      toast({
        title: "NVR deactivated",
        description: "The recorder has been removed from active use.",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Unable to deactivate NVR",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const clearFilters = () => {
    onSiteChange("");
    setStatusFilter("");
    setSearchTerm("");
  };

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load NVRs"
        description={getApiErrorMessage(error)}
      />
    );
  }

  return (
    <div className="space-y-6 px-4">
      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3 rounded-2xl border border-border/80 p-4">
            {[1, 2, 3, 4].map((index) => (
              <div
                key={index}
                className="grid gap-3 border-b border-border/60 py-4 md:grid-cols-[1.8fr_1fr_1fr]"
              >
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border/80 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-32 w-full" />
            <Skeleton className="mt-4 h-5 w-32" />
            <Skeleton className="mt-2 h-5 w-full" />
            <Skeleton className="mt-2 h-5 w-5/6" />
          </div>
        </div>
      ) : filteredNvrs.length === 0 ? (
        <StatusState
          variant="empty"
          title="No NVRs match the current filters"
          description="Try a broader search or clear the active filters."
        />
      ) : (
        <div className="max-w-3xl pt-4">
          <div className="text-foreground">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.05fr)_minmax(0,1fr)_180px] gap-4 border-b border-[var(--edge-subtle)] px-4 py-3 text-xs text-muted-foreground">
              <div>Recorder</div>
              <div>Last heartbeat</div>
              <div>Location</div>
              <div className="text-right">Actions</div>
            </div>
            {filteredNvrs.map((nvr) => {
              const isSelected = selectedNvr?.id === nvr.id;
              return (
                <button
                  key={nvr.id}
                  type="button"
                  onClick={() => setSelectedNvrId(nvr.id)}
                  className={[
                    "grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1.05fr)_minmax(0,1fr)_180px] gap-4 border-b border-[var(--edge-subtle)] px-4 py-4 text-left transition-colors",

                    createdId === nvr.id ? "ring-1 ring-emerald-400/40" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--edge-subtle)] bg-[var(--surface-subtle)] text-muted-foreground">
                        <NvrIcon className="text-lg" />
                      </div>
                      <div
                        className={[
                          "mt-1 h-2.5 w-2.5 rounded-full",
                          nvr.isOnline ? "bg-emerald-400" : "bg-rose-400",
                        ].join(" ")}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">
                          {nvr.name}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground/80">
                          {nvr.ipAddress} • {nvr._count?.cameras ?? 0} cameras
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {`${nvr.manufacturer}${nvr.model ? ` • ${nvr.model}` : ""}`}
                    </div>
                  </div>
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <div className="truncate">
                      {nvr.site?.name || "Unknown site"}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[var(--edge-subtle)] bg-transparent"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSettingsNvrId(nvr.id);
                      }}
                    >
                      Settings
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        deactivateMutation.mutate(nvr.id);
                      }}
                      disabled={deactivateMutation.isPending}
                    >
                      Deactivate
                    </Button>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <NVRSettingsModal
        key={settingsNvr?.id || "nvr-settings"}
        nvr={settingsNvr}
        sites={sites}
        open={Boolean(settingsNvr)}
        onOpenChange={(open) => {
          if (!open) setSettingsNvrId("");
        }}
      />

      <div className="absolute left-[-9999px] top-0">
        <div ref={nvrsPdfRef}>
          <PdfTemplate
            title="CCTV NVRs"
            subtitle={`${activeSiteName} | ${statusFilter || "All statuses"}`}
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Total NVRs", value: String(nvrs.length) },
              { label: "Online", value: String(onlineCount) },
              { label: "Offline", value: String(offlineCount) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">NVR</th>
                  <th className="py-2">Site</th>
                  <th className="py-2">IP</th>
                  <th className="py-2">Ports</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Cameras</th>
                </tr>
              </thead>
              <tbody>
                {filteredNvrs.map((nvr) => (
                  <tr key={nvr.id} className="border-b border-gray-100">
                    <td className="py-2">
                      <div className="font-semibold">{nvr.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {nvr.manufacturer}
                        {nvr.model ? ` | ${nvr.model}` : ""}
                      </div>
                    </td>
                    <td className="py-2">{nvr.site?.name || "Unknown"}</td>
                    <td className="py-2 font-mono">{nvr.ipAddress}</td>
                    <td className="py-2 font-mono">
                      RTSP {nvr.port} / HTTP {nvr.httpPort}
                    </td>
                    <td className="py-2">
                      {nvr.isOnline ? "Online" : "Offline"}
                    </td>
                    <td className="py-2 text-right">
                      {nvr._count?.cameras ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}

function NVRSettingsModal({
  nvr,
  sites,
  open,
  onOpenChange,
}: NVRSettingsModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSection, setActiveSection] =
    useState<NVRModalSection>("general");
  const [name, setName] = useState(nvr?.name || "");
  const [siteId, setSiteId] = useState(nvr?.siteId || "");
  const [manufacturer, setManufacturer] = useState(nvr?.manufacturer || "");
  const [model, setModel] = useState(nvr?.model || "");
  const [firmware, setFirmware] = useState(nvr?.firmware || "");
  const [ipAddress, setIpAddress] = useState(nvr?.ipAddress || "");
  const [rtspPort, setRtspPort] = useState(String(nvr?.rtspPort ?? 554));
  const [httpPort, setHttpPort] = useState(String(nvr?.httpPort ?? 80));
  const [servicePort, setServicePort] = useState(String(nvr?.port ?? 554));
  const [username, setUsername] = useState(nvr?.username || "");
  const [password, setPassword] = useState("");
  const [isapiEnabled, setIsapiEnabled] = useState(
    String(nvr?.isapiEnabled ?? true),
  );
  const [onvifEnabled, setOnvifEnabled] = useState(
    String(nvr?.onvifEnabled ?? false),
  );
  const [isOnline, setIsOnline] = useState(String(nvr?.isOnline ?? false));
  const [cameraName, setCameraName] = useState("");
  const [cameraArea, setCameraArea] = useState("");
  const [cameraChannel, setCameraChannel] = useState("1");
  const [cameraAudio, setCameraAudio] = useState("false");
  const [cameraSecurity, setCameraSecurity] = useState("false");

  const { data: cameraData, isLoading: camerasLoading } = useQuery({
    queryKey: ["cameras", "by-nvr", nvr?.id],
    queryFn: () => fetchCameras({ nvrId: nvr?.id, limit: 100 }),
    enabled: open && Boolean(nvr?.id),
  });

  const linkedCameras = useMemo(
    () => cameraData?.data ?? [],
    [cameraData?.data],
  );
  const selectedSite = sites.find((site) => site.id === siteId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!nvr) throw new Error("No NVR selected");
      return fetchJson<NVR>(`/api/cctv/nvrs/${nvr.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          siteId,
          manufacturer: manufacturer.trim(),
          model: model.trim() || undefined,
          firmware: firmware.trim() || undefined,
          ipAddress: ipAddress.trim(),
          rtspPort: Number(rtspPort),
          httpPort: Number(httpPort),
          port: Number(servicePort),
          username: username.trim(),
          password: password.trim() || undefined,
          isapiEnabled: isapiEnabled === "true",
          onvifEnabled: onvifEnabled === "true",
          isOnline: isOnline === "true",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nvrs"] });
      toast({
        title: "NVR settings saved",
        description: "Recorder settings were updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to save NVR settings",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const addCameraMutation = useMutation({
    mutationFn: async () => {
      if (!nvr) throw new Error("No NVR selected");
      return fetchJson<Camera>("/api/cctv/cameras", {
        method: "POST",
        body: JSON.stringify({
          name: cameraName.trim(),
          siteId: nvr.siteId,
          nvrId: nvr.id,
          area: cameraArea.trim(),
          channelNumber: Number(cameraChannel),
          hasAudio: cameraAudio === "true",
          hasPTZ: false,
          hasMotionDetect: true,
          isHighSecurity: cameraSecurity === "true",
          isOnline: false,
          isRecording: true,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      setCameraName("");
      setCameraArea("");
      setCameraChannel(String(linkedCameras.length + 1));
      setCameraAudio("false");
      setCameraSecurity("false");
      toast({
        title: "Camera added",
        description: "The camera was linked to this NVR.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to add camera",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const removeCameraMutation = useMutation({
    mutationFn: async (cameraId: string) =>
      fetchJson(`/api/cctv/cameras/${cameraId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      toast({
        title: "Camera removed",
        description: "The camera was unlinked from active monitoring.",
      });
    },
    onError: (error) => {
      toast({
        title: "Unable to remove camera",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const sections: Array<{ id: NVRModalSection; label: string; hint: string }> =
    [
      {
        id: "general",
        label: "General",
        hint: "Name, site, and recorder identity",
      },
      {
        id: "network",
        label: "Network",
        hint: "Address, ports, and credentials",
      },
      {
        id: "protocols",
        label: "Protocols",
        hint: "Integration and device state",
      },
      {
        id: "cameras",
        label: "Attached Cameras",
        hint: "View and add linked channels",
      },
    ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        inset={false}
        size="lg"
        className="max-w-[min(1200px,96vw)] overflow-hidden rounded-[1.6rem] border border-[var(--edge-default)] bg-[var(--surface-base)] p-0 text-foreground shadow-[var(--surface-frame-shadow)]"
      >
        <DialogTitle className="sr-only">NVR settings</DialogTitle>
        <DialogDescription>
          NVR settings and linked camera management.
        </DialogDescription>

        <div className="grid min-h-[80vh] grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-[var(--edge-subtle)] bg-[var(--surface-subtle)] px-4 py-5">
            <div className="mb-6">
              <div className="text-xs text-muted-foreground">Recorder</div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {nvr?.name || "NVR settings"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {nvr?.site?.name || "Select recorder"}
              </div>
            </div>
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={[
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                    activeSection === section.id
                      ? "bg-[var(--surface-base)] text-foreground"
                      : "text-muted-foreground hover:bg-[var(--surface-base)]/70 hover:text-foreground",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{section.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {section.hint}
                  </div>
                </button>
              ))}
            </nav>
          </aside>

          <div className="overflow-y-auto px-8 py-7">
            <div className="max-w-4xl space-y-8">
              <header className="border-b border-[var(--edge-subtle)] pb-5">
                <div className="text-xs text-muted-foreground">
                  {activeSection === "cameras"
                    ? "Linked channels"
                    : "NVR settings"}
                </div>
                <h2 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
                  {
                    sections.find((section) => section.id === activeSection)
                      ?.label
                  }
                </h2>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  {activeSection === "cameras"
                    ? "Add cameras directly to this recorder and keep the channel register in one place."
                    : "Configure recorder details without leaving the NVR workspace."}
                </p>
              </header>

              {activeSection === "general" ? (
                <div className="space-y-6">
                  <ModalSettingField
                    label="Recorder name"
                    description="Use a clear operational name that matches the site or surveillance zone."
                    control={
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    }
                  />
                  <ModalSettingField
                    label="Site"
                    description="The recorder site also becomes the default site for cameras linked here."
                    control={
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
                    }
                  />
                  <ModalSettingField
                    label="Manufacturer"
                    description="Keep the brand visible for support and field maintenance."
                    control={
                      <Input
                        value={manufacturer}
                        onChange={(event) =>
                          setManufacturer(event.target.value)
                        }
                      />
                    }
                  />
                  <ModalSettingField
                    label="Model and firmware"
                    description="Track the deployed recorder build without opening a separate maintenance screen."
                    control={
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          value={model}
                          onChange={(event) => setModel(event.target.value)}
                          placeholder="Model"
                        />
                        <Input
                          value={firmware}
                          onChange={(event) => setFirmware(event.target.value)}
                          placeholder="Firmware"
                        />
                      </div>
                    }
                  />
                </div>
              ) : null}

              {activeSection === "network" ? (
                <div className="space-y-6">
                  <ModalSettingField
                    label="Recorder address"
                    description="Primary IP or hostname used to reach the recorder."
                    control={
                      <Input
                        value={ipAddress}
                        onChange={(event) => setIpAddress(event.target.value)}
                      />
                    }
                  />
                  <ModalSettingField
                    label="Ports"
                    description="Keep the core service ports visible for setup and support."
                    control={
                      <div className="grid gap-3 md:grid-cols-3">
                        <Input
                          type="number"
                          value={rtspPort}
                          onChange={(event) => setRtspPort(event.target.value)}
                          placeholder="RTSP"
                        />
                        <Input
                          type="number"
                          value={httpPort}
                          onChange={(event) => setHttpPort(event.target.value)}
                          placeholder="HTTP"
                        />
                        <Input
                          type="number"
                          value={servicePort}
                          onChange={(event) =>
                            setServicePort(event.target.value)
                          }
                          placeholder="Service"
                        />
                      </div>
                    }
                  />
                  <ModalSettingField
                    label="Credentials"
                    description="Update access details here; leave password empty if it should remain unchanged."
                    control={
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="Username"
                        />
                        <Input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="Password"
                        />
                      </div>
                    }
                  />
                </div>
              ) : null}

              {activeSection === "protocols" ? (
                <div className="space-y-6">
                  <ModalSettingField
                    label="Integration protocols"
                    description="Keep only the recorder capabilities we actively use visible."
                    control={
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select
                          value={isapiEnabled}
                          onValueChange={setIsapiEnabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="ISAPI" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">ISAPI enabled</SelectItem>
                            <SelectItem value="false">
                              ISAPI disabled
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={onvifEnabled}
                          onValueChange={setOnvifEnabled}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="ONVIF" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">ONVIF enabled</SelectItem>
                            <SelectItem value="false">
                              ONVIF disabled
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    }
                  />
                  <ModalSettingField
                    label="Current device state"
                    description="This status reflects how the recorder should appear in the register."
                    control={
                      <Select value={isOnline} onValueChange={setIsOnline}>
                        <SelectTrigger className="w-full border-white/10 text-white md:w-[240px]">
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Online</SelectItem>
                          <SelectItem value="false">Offline</SelectItem>
                        </SelectContent>
                      </Select>
                    }
                  />
                  <div className="grid gap-4 border-t border-white/10 pt-5 md:grid-cols-3">
                    <ModalStat
                      label="Site"
                      value={selectedSite?.name || "Unassigned"}
                    />
                    <ModalStat
                      label="Last heartbeat"
                      value={formatHeartbeat(nvr?.lastHeartbeat)}
                    />
                    <ModalStat
                      label="Linked cameras"
                      value={String(
                        nvr?._count?.cameras ?? linkedCameras.length,
                      )}
                    />
                  </div>
                </div>
              ) : null}

              {activeSection === "cameras" ? (
                <div className="space-y-7">
                  <section className="border-b border-white/10 pb-6">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_140px_auto]">
                      <Input
                        value={cameraName}
                        onChange={(event) => setCameraName(event.target.value)}
                        placeholder="Camera name"
                      />
                      <Input
                        value={cameraArea}
                        onChange={(event) => setCameraArea(event.target.value)}
                        placeholder="Area / location"
                      />
                      <Input
                        type="number"
                        value={cameraChannel}
                        onChange={(event) =>
                          setCameraChannel(event.target.value)
                        }
                        placeholder="Channel"
                      />
                      <Button
                        type="button"
                        onClick={() => addCameraMutation.mutate()}
                        disabled={
                          !cameraName.trim() ||
                          !cameraArea.trim() ||
                          !cameraChannel.trim() ||
                          addCameraMutation.isPending
                        }
                      >
                        {addCameraMutation.isPending
                          ? "Adding..."
                          : "Add camera"}
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Select
                        value={cameraAudio}
                        onValueChange={setCameraAudio}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Audio" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">No audio</SelectItem>
                          <SelectItem value="true">Audio enabled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={cameraSecurity}
                        onValueChange={setCameraSecurity}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Security" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Standard camera</SelectItem>
                          <SelectItem value="true">
                            High-security camera
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_120px_120px] gap-3 border-b border-[var(--edge-subtle)] pb-3 text-xs text-muted-foreground">
                      <div>Camera</div>
                      <div>Area</div>
                      <div>Channel</div>
                      <div>Status</div>
                      <div className="text-right">Action</div>
                    </div>
                    {camerasLoading ? (
                      <div className="py-8 text-sm text-white/50">
                        Loading linked cameras...
                      </div>
                    ) : linkedCameras.length === 0 ? (
                      <div className="flex min-h-[220px] items-center justify-center bg-[var(--surface-subtle)] text-sm text-muted-foreground">
                        No cameras linked to this NVR yet.
                      </div>
                    ) : (
                      linkedCameras.map((camera) => (
                        <div
                          key={camera.id}
                          className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_120px_120px_120px] items-center gap-3 border-b border-[var(--edge-subtle)] py-3 text-sm text-foreground"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {camera.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {camera.site?.name || nvr?.site?.name}
                            </div>
                          </div>
                          <div className="truncate text-muted-foreground">
                            {camera.area}
                          </div>
                          <div className="tabular-nums text-muted-foreground">
                            {camera.channelNumber}
                          </div>
                          <div>{camera.isOnline ? "Online" : "Offline"}</div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:text-rose-700"
                              onClick={() =>
                                removeCameraMutation.mutate(camera.id)
                              }
                              disabled={removeCameraMutation.isPending}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </section>
                </div>
              ) : null}

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--edge-subtle)] pt-5">
                <div className="text-xs text-muted-foreground">
                  Recorder workspace for settings and linked camera maintenance.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="border-[var(--edge-subtle)] bg-transparent"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                  {activeSection !== "cameras" ? (
                    <Button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? "Saving..." : "Save settings"}
                    </Button>
                  ) : null}
                </div>
              </footer>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModalSettingField({
  label,
  description,
  control,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-[var(--edge-subtle)] pb-5 md:grid-cols-[minmax(0,1.35fr)_minmax(280px,360px)] md:items-start">
      <div>
        <div className="text-lg font-medium text-foreground">{label}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      <div>{control}</div>
    </div>
  );
}

function ModalStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
