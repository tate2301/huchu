"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchTrainingRecords, fetchUsers, type TrainingRecordSummary } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TrainingForm = {
  id?: string;
  userId: string;
  trainingType: string;
  trainingDate: string;
  expiryDate: string;
  certificateUrl: string;
  trainedBy: string;
  notes: string;
};

const emptyForm: TrainingForm = {
  userId: "",
  trainingType: "",
  trainingDate: "",
  expiryDate: "",
  certificateUrl: "",
  trainedBy: "",
  notes: "",
};

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");
const TODAY_ISO = new Date().toISOString().slice(0, 10);

export function TrainingTab({ createdId }: { createdId: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [expiringFilter, setExpiringFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TrainingForm>(emptyForm);

  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ["users", "compliance", "training"],
    queryFn: () => fetchUsers({ limit: 500 }),
  });
  const users = usersData?.data ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "training", expiringFilter, search],
    queryFn: () =>
      fetchTrainingRecords({
        expiringDays: expiringFilter === "expiring" ? 30 : undefined,
        search: search || undefined,
        limit: 500,
      }),
  });

  const records = useMemo(() => data?.data ?? [], [data]);
  const pageError = usersError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "training");
    params.set("createdId", id);
    params.set("source", "training");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance?${params.toString()}`);
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: TrainingForm) => {
      const method = payload.id ? "PATCH" : "POST";
      const url = payload.id ? `/api/compliance/training-records/${payload.id}` : "/api/compliance/training-records";
      return fetchJson<TrainingRecordSummary>(url, {
        method,
        body: JSON.stringify({
          userId: payload.userId,
          trainingType: payload.trainingType,
          trainingDate: payload.trainingDate,
          expiryDate: payload.expiryDate || undefined,
          certificateUrl: payload.certificateUrl || undefined,
          trainedBy: payload.trainedBy || undefined,
          notes: payload.notes || undefined,
        }),
      });
    },
    onSuccess: (record) => {
      toast({
        title: form.id ? "Training updated" : "Training created",
        description: "Training record saved successfully.",
        variant: "success",
      });
      setDialogOpen(false);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["compliance", "training"] });
      pushSaved(record.id, record.createdAt);
    },
    onError: (saveError) => {
      toast({
        title: "Unable to save training",
        description: getApiErrorMessage(saveError),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/compliance/training-records/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({
        title: "Training deleted",
        description: "Training record was removed.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["compliance", "training"] });
    },
    onError: (deleteError) => {
      toast({
        title: "Unable to delete training",
        description: getApiErrorMessage(deleteError),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setForm({
      ...emptyForm,
      userId: users[0]?.id ?? "",
      trainingDate: new Date().toISOString().slice(0, 10),
    });
    setDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Training Records</CardTitle>
              <CardDescription>Track certification expiry and refresher schedules</CardDescription>
            </div>
            <Button onClick={openCreate}>New Training</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pageError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load training records</AlertTitle>
              <AlertDescription>{getApiErrorMessage(pageError)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold">Scope</label>
              <Select value={expiringFilter} onValueChange={setExpiringFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All records" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All records</SelectItem>
                  <SelectItem value="expiring">Expiring in 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold">Search</label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Training type, trained by, user"
              />
            </div>
          </div>

          {isLoading || usersLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : records.length === 0 ? (
            <div className="text-sm text-muted-foreground">No training records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">User</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Training</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Expiry</TableHead>
                    <TableHead className="p-3 text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => {
                    const expired =
                      Boolean(record.expiryDate) &&
                      toDateInput(record.expiryDate) < TODAY_ISO;
                    return (
                      <TableRow
                        key={record.id}
                        className={`border-b ${createdId === record.id ? "bg-[var(--status-success-bg)]" : ""}`}
                      >
                        <TableCell className="p-3">{record.user.name}</TableCell>
                        <TableCell className="p-3">{record.trainingType}</TableCell>
                        <TableCell className="p-3">{toDateInput(record.trainingDate)}</TableCell>
                        <TableCell className="p-3">
                          <div className="flex items-center gap-2">
                            <span>{toDateInput(record.expiryDate)}</span>
                            {record.expiryDate ? (
                              <Badge variant={expired ? "destructive" : "outline"}>
                                {expired ? "Expired" : "Active"}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setForm({
                                  id: record.id,
                                  userId: record.userId,
                                  trainingType: record.trainingType,
                                  trainingDate: toDateInput(record.trainingDate),
                                  expiryDate: toDateInput(record.expiryDate),
                                  certificateUrl: record.certificateUrl ?? "",
                                  trainedBy: record.trainedBy ?? "",
                                  notes: record.notes ?? "",
                                });
                                setDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (!window.confirm("Delete this training record?")) return;
                                deleteMutation.mutate(record.id);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Training" : "New Training"}</DialogTitle>
            <DialogDescription>Capture training details and certificate expiry.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div>
              <label className="mb-2 block text-sm font-semibold">User *</label>
              <Select
                value={form.userId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, userId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Training Type *</label>
              <Input
                value={form.trainingType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, trainingType: event.target.value }))
                }
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold">Training Date *</label>
                <Input
                  type="date"
                  value={form.trainingDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, trainingDate: event.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Expiry Date</label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Certificate URL</label>
              <Input
                type="url"
                value={form.certificateUrl}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, certificateUrl: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Trained By</label>
              <Input
                value={form.trainedBy}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, trainedBy: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Notes</label>
              <Textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}


