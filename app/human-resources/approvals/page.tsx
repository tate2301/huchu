"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"

import { HrShell } from "@/components/human-resources/hr-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchApprovalHistory } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function ApprovalsPage() {
  const [entityType, setEntityType] = useState<string>("all")
  const [entityId, setEntityId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["approval-history", entityType, entityId, startDate, endDate],
    queryFn: () =>
      fetchApprovalHistory({
        entityType:
          entityType === "all"
            ? undefined
            : (entityType as
                | "PAYROLL_RUN"
                | "DISBURSEMENT_BATCH"
                | "ADJUSTMENT_ENTRY"
                | "COMPENSATION_PROFILE"
                | "COMPENSATION_RULE"
                | "GOLD_SHIFT_ALLOCATION"
                | "DISCIPLINARY_ACTION"),
        entityId: entityId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 500,
      }),
  })

  const records = useMemo(() => data?.data ?? [], [data])

  return (
    <HrShell activeTab="approvals" description="Track submit, approve, reject, and adjustment events">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load approval history</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow by entity type, target id, and date window.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                <SelectItem value="PAYROLL_RUN">Payroll runs</SelectItem>
                <SelectItem value="DISBURSEMENT_BATCH">Disbursement batches</SelectItem>
                <SelectItem value="ADJUSTMENT_ENTRY">Adjustments</SelectItem>
                <SelectItem value="COMPENSATION_PROFILE">Compensation profiles</SelectItem>
                <SelectItem value="COMPENSATION_RULE">Compensation rules</SelectItem>
                <SelectItem value="GOLD_SHIFT_ALLOCATION">Gold payout allocations</SelectItem>
                <SelectItem value="DISCIPLINARY_ACTION">Disciplinary actions</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              placeholder="Entity ID"
            />
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approval Timeline</CardTitle>
          <CardDescription>Immutable audit feed of approval workflow actions.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : records.length === 0 ? (
            <div className="text-sm text-muted-foreground">No approval actions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="p-3 text-left font-semibold">Timestamp</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Entity</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Action</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Status Change</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Actor</TableHead>
                    <TableHead className="p-3 text-left font-semibold">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id} className="border-b">
                      <TableCell className="p-3">{format(new Date(record.actedAt), "yyyy-MM-dd HH:mm:ss")}</TableCell>
                      <TableCell className="p-3">
                        <div className="font-semibold">{record.entityType}</div>
                        <div className="text-xs text-muted-foreground">{record.entityId}</div>
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge variant="outline">{record.action}</Badge>
                      </TableCell>
                      <TableCell className="p-3">
                        {(record.fromStatus ?? "-") + " -> " + (record.toStatus ?? "-")}
                      </TableCell>
                      <TableCell className="p-3">
                        <div>{record.actedBy.name}</div>
                        <div className="text-xs text-muted-foreground">{record.actedBy.role}</div>
                      </TableCell>
                      <TableCell className="p-3">{record.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </HrShell>
  )
}


