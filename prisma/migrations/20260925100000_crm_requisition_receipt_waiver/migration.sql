-- Accounting for a requisition from its receipts.
--
-- An acquittal used to be a number the requester typed: "what it came to".
-- It is now the sum of the spend lines they report against the requisition,
-- each with a photograph of its receipt, and it is refused while any line has
-- none. That refusal needs a way round for the diesel bought at a pump whose
-- till was down -- and the way round must leave a trail, or it becomes the
-- way everything is acquitted.
--
-- So a manager, never the requester, can waive the missing receipts, and has
-- to say why. Who and why are both kept. SET NULL on the person: a waiver
-- that outlives the account of whoever gave it still happened.
ALTER TABLE "CrmRequisition" ADD COLUMN "receiptsWaivedById" TEXT;
ALTER TABLE "CrmRequisition" ADD COLUMN "receiptWaiverNote" TEXT;

ALTER TABLE "CrmRequisition"
  ADD CONSTRAINT "CrmRequisition_receiptsWaivedById_fkey" FOREIGN KEY ("receiptsWaivedById")
  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
