"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkGenerateInvoices, fetchSchoolFeeStructures } from "@/lib/schools/fees-v2";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";

type BulkGenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BulkGenerateInvoicesDialog({ open, onOpenChange }: BulkGenerateDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    termId: "",
    classId: "",
    streamId: "",
    feeStructureId: "",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    issueNow: false,
    skipExisting: true,
    notes: "",
  });

  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "list"],
    queryFn: () => fetchSchoolsClasses({ limit: 200 }),
    enabled: open,
  });

  const structuresQuery = useQuery({
    queryKey: ["schools", "fees", "structures", "list"],
    queryFn: () => fetchSchoolFeeStructures({ limit: 200, status: "ACTIVE", includeLines: true }),
    enabled: open,
  });

  const generateMutation = useMutation({
    mutationFn: bulkGenerateInvoices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees", "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["schools", "fees", "summary"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.feeStructureId || !formData.termId || !formData.issueDate || !formData.dueDate) {
      return;
    }
    generateMutation.mutate({
      termId: formData.termId,
      classId: formData.classId || undefined,
      streamId: formData.streamId || undefined,
      feeStructureId: formData.feeStructureId,
      issueDate: formData.issueDate,
      dueDate: formData.dueDate,
      issueNow: formData.issueNow,
      skipExisting: formData.skipExisting,
      notes: formData.notes || undefined,
    });
  };

  const handleClose = () => {
    if (!generateMutation.isPending) {
      onOpenChange(false);
      generateMutation.reset();
    }
  };

  const structures = structuresQuery.data?.data ?? [];
  const classes = classesQuery.data?.data ?? [];

  // Get unique terms from structures
  const terms = Array.from(
    new Map(structures.map((s) => [s.term.id, s.term])).values()
  );

  // Filter structures by selected term and class
  const filteredStructures = structures.filter((s) => {
    if (formData.termId && s.term.id !== formData.termId) return false;
    if (formData.classId && s.class.id !== formData.classId) return false;
    return true;
  });

  const selectedStructure = structures.find((s) => s.id === formData.feeStructureId);
  const result = generateMutation.data?.data;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Generate Invoices</DialogTitle>
          <DialogDescription>
            Generate fee invoices for multiple students at once using a fee structure template.
          </DialogDescription>
        </DialogHeader>

        {generateMutation.isSuccess && result ? (
          <div className="space-y-4">
            <Alert variant={result.errors.length > 0 ? "default" : "default"}>
              <AlertTitle>Generation Complete</AlertTitle>
              <AlertDescription>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span>Created:</span>
                    <span className="font-mono font-medium">{result.created}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Eligible:</span>
                    <span className="font-mono">{result.summary.totalEligible}</span>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-medium text-destructive mb-2">
                        Errors ({result.errors.length}):
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {result.errors.map((err, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground">
                            {err.studentNo}: {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>

            <div className="bg-muted/30 rounded-md p-3 text-sm">
              <div className="font-medium mb-1">Summary</div>
              <div className="text-muted-foreground">
                Fee Structure: <span className="font-mono">{result.summary.feeStructure.name}</span>
                <br />
                Class: <span className="font-mono">{result.summary.feeStructure.class}</span>
                <br />
                Term: <span className="font-mono">{result.summary.feeStructure.term}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {generateMutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {generateMutation.error instanceof Error
                    ? generateMutation.error.message
                    : "Failed to generate invoices"}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="termId">Term *</Label>
                <Select
                  value={formData.termId}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, termId: value, feeStructureId: "" }))
                  }
                >
                  <SelectTrigger id="termId">
                    <SelectValue placeholder="Select term" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((term) => (
                      <SelectItem key={term.id} value={term.id}>
                        {term.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="classId">Class (Optional)</Label>
                <Select
                  value={formData.classId}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, classId: value, feeStructureId: "" }))
                  }
                >
                  <SelectTrigger id="classId">
                    <SelectValue placeholder="All classes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All classes</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feeStructureId">Fee Structure *</Label>
              <Select
                value={formData.feeStructureId}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, feeStructureId: value }))
                }
                disabled={!formData.termId}
              >
                <SelectTrigger id="feeStructureId">
                  <SelectValue placeholder="Select fee structure" />
                </SelectTrigger>
                <SelectContent>
                  {filteredStructures.map((structure) => (
                    <SelectItem key={structure.id} value={structure.id}>
                      <div className="flex items-center gap-2">
                        <span>{structure.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({structure.class.name})
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {structure._count.lines} lines
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedStructure && (
                <p className="text-xs text-muted-foreground">
                  Total: <span className="font-mono">{selectedStructure.totals?.amount.toFixed(2)}</span>{" "}
                  {selectedStructure.currency}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date *</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, issueDate: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date *</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, dueDate: e.target.value }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Additional notes for these invoices"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skipExisting"
                  checked={formData.skipExisting}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, skipExisting: checked === true }))
                  }
                />
                <Label htmlFor="skipExisting" className="font-normal cursor-pointer">
                  Skip students who already have invoices for this term
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="issueNow"
                  checked={formData.issueNow}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, issueNow: checked === true }))
                  }
                />
                <Label htmlFor="issueNow" className="font-normal cursor-pointer">
                  Issue immediately (post to accounting)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? "Generating..." : "Generate Invoices"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
