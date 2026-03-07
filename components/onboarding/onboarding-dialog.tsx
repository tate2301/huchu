"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Progress } from "@/components/ui/progress";
import { getApiErrorMessage } from "@/lib/api-client";

type OnboardingStep = 0 | 1 | 2 | 3;

type SiteFormData = {
  name: string;
  code: string;
  location: string;
};

type DepartmentFormData = {
  name: string;
  code: string;
};

type OnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
};

export function OnboardingDialog({ open, onOpenChange, onComplete }: OnboardingDialogProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(0);
  const [sites, setSites] = useState<SiteFormData[]>([{ name: "", code: "", location: "" }]);
  const [departments, setDepartments] = useState<DepartmentFormData[]>([{ name: "", code: "" }]);

  const completionMutation = useMutation({
    mutationFn: async (data: { sites: SiteFormData[]; departments: DepartmentFormData[] }) => {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to complete onboarding");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      onComplete();
      onOpenChange(false);
    },
  });

  const handleAddSite = () => {
    setSites([...sites, { name: "", code: "", location: "" }]);
  };

  const handleRemoveSite = (index: number) => {
    if (sites.length > 1) {
      setSites(sites.filter((_, i) => i !== index));
    }
  };

  const handleSiteChange = (index: number, field: keyof SiteFormData, value: string) => {
    const newSites = [...sites];
    newSites[index][field] = value;
    setSites(newSites);
  };

  const handleAddDepartment = () => {
    setDepartments([...departments, { name: "", code: "" }]);
  };

  const handleRemoveDepartment = (index: number) => {
    setDepartments(departments.filter((_, i) => i !== index));
  };

  const handleDepartmentChange = (index: number, field: keyof DepartmentFormData, value: string) => {
    const newDepartments = [...departments];
    newDepartments[index][field] = value;
    setDepartments(newDepartments);
  };

  const canProceedFromStep0 = true; // Welcome step
  const canProceedFromStep1 = sites.some((site) => site.name && site.code);
  const canProceedFromStep2 = departments.some((dept) => dept.name && dept.code);

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((currentStep + 1) as OnboardingStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((currentStep - 1) as OnboardingStep);
    }
  };

  const handleSubmit = () => {
    const validSites = sites.filter((site) => site.name && site.code);
    const validDepartments = departments.filter((dept) => dept.name && dept.code);

    if (validSites.length === 0) {
      return;
    }

    completionMutation.mutate({
      sites: validSites,
      departments: validDepartments,
    });
  };

  const progressPercentage = ((currentStep + 1) / 4) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
              <h3 className="text-lg font-semibold">Welcome to Huchu!</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Let&apos;s set up your organization by creating some essential entities.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                This wizard will guide you through setting up:
              </p>
              <ul className="mt-2 space-y-1 text-left text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">Required</Badge>
                  <span>At least one site/location</span>
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Optional</Badge>
                  <span>Departments for organization structure</span>
                </li>
              </ul>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xs">Required</Badge>
                <p className="text-sm font-medium">At least one site is required</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sites represent physical locations or operational units in your organization.
              </p>
            </div>
            <div className="space-y-4">
              {sites.map((site, index) => (
                <div key={index} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Site {index + 1}</h4>
                    {sites.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSite(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`site-name-${index}`}>
                      Site Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`site-name-${index}`}
                      value={site.name}
                      onChange={(e) => handleSiteChange(index, "name", e.target.value)}
                      placeholder="e.g., Main Mine, Processing Plant"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`site-code-${index}`}>
                      Site Code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`site-code-${index}`}
                      value={site.code}
                      onChange={(e) => handleSiteChange(index, "code", e.target.value.toUpperCase())}
                      placeholder="e.g., MAIN, PROC"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`site-location-${index}`}>Location</Label>
                    <Input
                      id={`site-location-${index}`}
                      value={site.location}
                      onChange={(e) => handleSiteChange(index, "location", e.target.value)}
                      placeholder="e.g., Kadoma, Zimbabwe"
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={handleAddSite} className="w-full">
              Add Another Site
            </Button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Optional</Badge>
                <p className="text-sm font-medium">Departments help organize your team</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                You can skip this step and add departments later from the management section.
              </p>
            </div>
            <div className="space-y-4">
              {departments.map((dept, index) => (
                <div key={index} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Department {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveDepartment(index)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`dept-name-${index}`}>Department Name</Label>
                    <Input
                      id={`dept-name-${index}`}
                      value={dept.name}
                      onChange={(e) => handleDepartmentChange(index, "name", e.target.value)}
                      placeholder="e.g., Mining, Processing, Administration"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`dept-code-${index}`}>Department Code</Label>
                    <Input
                      id={`dept-code-${index}`}
                      value={dept.code}
                      onChange={(e) => handleDepartmentChange(index, "code", e.target.value.toUpperCase())}
                      placeholder="e.g., MIN, PROC, ADMIN"
                      maxLength={10}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={handleAddDepartment} className="w-full">
              Add Another Department
            </Button>
          </div>
        );

      case 3:
        const validSitesCount = sites.filter((site) => site.name && site.code).length;
        const validDepartmentsCount = departments.filter((dept) => dept.name && dept.code).length;
        const setupComplete = validSitesCount > 0;

        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-6">
              <h3 className="text-lg font-semibold">Review Your Setup</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Please review the information below before completing setup.
              </p>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Sites</h4>
                    <p className="text-xs text-muted-foreground">
                      {validSitesCount} site{validSitesCount !== 1 ? "s" : ""} configured
                    </p>
                  </div>
                  <Badge variant={validSitesCount > 0 ? "default" : "destructive"}>
                    {validSitesCount > 0 ? "Complete" : "Required"}
                  </Badge>
                </div>
                {validSitesCount > 0 && (
                  <ul className="mt-3 space-y-1">
                    {sites
                      .filter((site) => site.name && site.code)
                      .map((site, index) => (
                        <li key={index} className="text-sm">
                          • {site.name} ({site.code})
                          {site.location && ` - ${site.location}`}
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Departments</h4>
                    <p className="text-xs text-muted-foreground">
                      {validDepartmentsCount} department{validDepartmentsCount !== 1 ? "s" : ""} configured
                    </p>
                  </div>
                  <Badge variant={validDepartmentsCount > 0 ? "default" : "secondary"}>
                    {validDepartmentsCount > 0 ? "Complete" : "Optional"}
                  </Badge>
                </div>
                {validDepartmentsCount > 0 && (
                  <ul className="mt-3 space-y-1">
                    {departments
                      .filter((dept) => dept.name && dept.code)
                      .map((dept, index) => (
                        <li key={index} className="text-sm">
                          • {dept.name} ({dept.code})
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            {!setupComplete && (
              <Alert variant="destructive">
                <AlertTitle>Cannot Complete Setup</AlertTitle>
                <AlertDescription>
                  You must configure at least one site before completing setup.
                </AlertDescription>
              </Alert>
            )}

            {completionMutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Setup Failed</AlertTitle>
                <AlertDescription>
                  {getApiErrorMessage(completionMutation.error)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" tabletBehavior="fullscreen" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {currentStep === 0 && "Welcome to Huchu"}
            {currentStep === 1 && "Set Up Sites"}
            {currentStep === 2 && "Set Up Departments"}
            {currentStep === 3 && "Review & Complete"}
          </DialogTitle>
          <DialogDescription>
            Step {currentStep + 1} of 4
          </DialogDescription>
          <Progress value={progressPercentage} className="mt-2" />
        </DialogHeader>

        <div className="py-4">{renderStepContent()}</div>

        <DialogFooter className="flex-row justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0 || completionMutation.isPending}
          >
            Back
          </Button>
          <div className="flex gap-2">
            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={
                  (currentStep === 1 && !canProceedFromStep1) ||
                  completionMutation.isPending
                }
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={
                  !canProceedFromStep1 ||
                  completionMutation.isPending
                }
              >
                {completionMutation.isPending ? "Setting Up..." : "Complete Setup"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
