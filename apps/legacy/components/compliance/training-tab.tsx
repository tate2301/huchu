"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import type { DataTableColumn } from "@corelithzw/react";
import {
  DetailFact,
  MasterDataPage,
} from "@corelithzw/shell/master-data-page";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@corelithzw/ui/components/dialog";
import { Input } from "@corelithzw/ui/components/input";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@corelithzw/ui/components/select";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchTrainingRecords, fetchUsers, type TrainingRecordSummary } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

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

export function TrainingTab({ createdId, banner }: { createdId: string | null; banner?: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [expiringFilter, setExpiringFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Server-side filter; deferring keeps one request per pause, not keystroke.
  const deferredSearch = useDeferredValue(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TrainingForm>(emptyForm);

  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ["users", "compliance", "training"],
    queryFn: () => fetchUsers({ limit: 500 }),
  });
  const users = usersData?.data ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["compliance", "training", expiringFilter, deferredSearch],
    queryFn: () =>
      fetchTrainingRecords({
        expiringDays: expiringFilter === "expiring" ? 30 : undefined,
        search: deferredSearch || undefined,
        limit: 500,
      }),
  });

  const records = useMemo(() => data?.data ?? [], [data]);
  const pageError = usersError || error;

  const pushSaved = (id: string, createdAt?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("createdId", id);
    params.set("source", "training");
    if (createdAt) {
      params.set("createdAt", createdAt);
    } else {
      params.delete("createdAt");
    }
    router.push(`/compliance/training?${params.toString()}`);
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

  const openEdit = (row: TrainingRecordSummary) => {
    setForm({
      id: row.id,
      userId: row.userId,
      trainingType: row.trainingType,
      trainingDate: toDateInput(row.trainingDate),
      expiryDate: toDateInput(row.expiryDate),
      certificateUrl: row.certificateUrl ?? "",
      trainedBy: row.trainedBy ?? "",
      notes: row.notes ?? "",
    });
    setDialogOpen(true);
  };

  // No actions column: a row is picked, and what can be done to it lives in
  // the detail pane.
  const columns = useMemo<DataTableColumn<TrainingRecordSummary>[]>(
    () => [
      {
        key: "user",
        header: "User",
        sortable: true,
        sortAccessor: (row) => row.user.name,
        render: (row) => (
          <div>
            <div>{row.user.name}</div>
            {createdId === row.id ? <Badge variant="secondary">Saved</Badge> : null}
          </div>
        ),
      },
      {
        key: "trainingType",
        header: "Training",
        sortable: true,
        sortAccessor: (row) => row.trainingType,
        render: (row) => row.trainingType,
      },
      {
        key: "trainingDate",
        header: "Date",
        sortable: true,
        sortAccessor: (row) => row.trainingDate,
        render: (row) => <NumericCell align="left">{toDateInput(row.trainingDate)}</NumericCell>,
      },
      {
        key: "expiryDate",
        header: "Expiry",
        sortable: true,
        sortAccessor: (row) => row.expiryDate ?? "",
        render: (row) => {
          const expired = Boolean(row.expiryDate) && toDateInput(row.expiryDate) < TODAY_ISO;
          return (
            <div className="flex items-center gap-2">
              <NumericCell align="left">{toDateInput(row.expiryDate)}</NumericCell>
              {row.expiryDate ? (
                <Badge variant={expired ? "destructive" : "outline"}>
                  {expired ? "Expired" : "Active"}
                </Badge>
              ) : null}
            </div>
          );
        },
      },
    ],
    [createdId],
  );

  return (
    <MasterDataPage<TrainingRecordSummary>
      area="compliance"
      title="Compliance Training"
      description="Monitor training records, expiries, and certificate evidence."
      createLabel="New Training"
      onCreate={openCreate}
      columns={columns}
      data={records}
      rowKey={(row) => row.id}
      isLoading={isLoading || usersLoading}
      error={pageError}
      emptyLabel="No training records found."
      banner={banner}
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Training type, trained by, user"
          aria-label="Search training records"
          className="h-9 w-full sm:w-64"
        />
      }
      filters={
        <Select value={expiringFilter} onValueChange={setExpiringFilter}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="All records" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            <SelectItem value="expiring">Expiring in 30 days</SelectItem>
          </SelectContent>
        </Select>
      }
      renderDetail={(row, close) => {
        const expired = Boolean(row.expiryDate) && toDateInput(row.expiryDate) < TODAY_ISO;
        return (
          <div className="space-y-4">
            <div className="space-y-3">
              <DetailFact label="User">{row.user.name}</DetailFact>
              <DetailFact label="Training Type">{row.trainingType}</DetailFact>
              <DetailFact label="Training Date">{toDateInput(row.trainingDate)}</DetailFact>
              {row.expiryDate ? (
                <DetailFact label="Expiry Date">
                  <div className="flex items-center gap-2">
                    <span>{toDateInput(row.expiryDate)}</span>
                    <Badge variant={expired ? "destructive" : "outline"}>
                      {expired ? "Expired" : "Active"}
                    </Badge>
                  </div>
                </DetailFact>
              ) : null}
              {row.trainedBy ? <DetailFact label="Trained By">{row.trainedBy}</DetailFact> : null}
              {row.certificateUrl ? (
                <DetailFact label="Certificate">
                  <a
                    href={row.certificateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Open certificate
                  </a>
                </DetailFact>
              ) : null}
              {row.notes ? <DetailFact label="Notes">{row.notes}</DetailFact> : null}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!window.confirm("Delete this training record?")) return;
                  deleteMutation.mutate(row.id, { onSuccess: close });
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        );
      }}
    >
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md" className="w-full">
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
    </MasterDataPage>
  );
}
