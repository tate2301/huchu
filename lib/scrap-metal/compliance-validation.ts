import type { ScrapTicketComplianceRequirements } from "@/lib/scrap-metal/compliance-rules";

type ValidateScrapComplianceInput = {
  requirements: ScrapTicketComplianceRequirements;
  attachmentsCount: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
};

export function validateScrapTicketCompliance(input: ValidateScrapComplianceInput): string[] {
  const errors: string[] = [];

  if (input.requirements.requirePhotos && input.attachmentsCount <= 0) {
    errors.push("At least one ticket photo is required by compliance rules.");
  }

  if (input.requirements.requirePaymentMethod && !input.paymentMethod?.trim()) {
    errors.push("Payment method is required by compliance rules.");
  }

  if (input.requirements.requirePaymentReference && !input.paymentReference?.trim()) {
    errors.push("Payment reference is required by compliance rules.");
  }

  if (input.requirements.requireNotes && !input.notes?.trim()) {
    errors.push("Ticket notes are required by compliance rules.");
  }

  return errors;
}

