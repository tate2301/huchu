import type { UniversalDocumentPayload } from "./types";

/**
 * Representative sample payloads used by the template editor's live preview —
 * one per document family, showing every layout region a template can affect.
 */

const SAMPLE_LINES = [
  { description: "Custom logo mat 85×150cm — full colour", quantity: "2", unitPrice: "180.00", taxRate: "15%", lineTotal: "414.00" },
  { description: "Entrance mat 60×90cm — charcoal", quantity: "4", unitPrice: "65.00", taxRate: "15%", lineTotal: "299.00" },
  { description: "On-site measurement & fitting", quantity: "1", unitPrice: "50.00", taxRate: "—", lineTotal: "50.00" },
];

const SAMPLE_LINE_COLUMNS = [
  { key: "description", label: "Description" },
  { key: "quantity", label: "Qty" },
  { key: "unitPrice", label: "Unit Price" },
  { key: "taxRate", label: "Tax" },
  { key: "lineTotal", label: "Amount" },
];

const SAMPLE_PARTY = {
  title: "Bill To",
  lines: ["Acme Retail (Pvt) Ltd", "Jane Moyo", "12 Samora Machel Ave, Harare", "+263 77 123 4567", "accounts@acme.co.zw"],
};

function invoiceSample(): UniversalDocumentPayload {
  return {
    title: "Invoice",
    subtitle: "INV-20260724-1015-482",
    badge: { label: "Awaiting payment", tone: "warning" },
    meta: [
      { label: "Invoice No.", value: "INV-20260724-1015-482" },
      { label: "Issue Date", value: "2026-07-24" },
      { label: "Due Date", value: "2026-08-07" },
      { label: "Currency", value: "USD" },
    ],
    parties: [SAMPLE_PARTY],
    totals: [
      { label: "Subtotal", value: "USD 670.00" },
      { label: "Tax", value: "USD 93.00" },
      { label: "Total", value: "USD 763.00" },
      { label: "Amount paid", value: "USD 300.00" },
      { label: "Balance due", value: "USD 463.00", emphasis: true },
    ],
    notes: ["Payment due within 14 days. Late payments attract 2% monthly interest."],
    record: { sections: [], lineColumns: SAMPLE_LINE_COLUMNS, lines: SAMPLE_LINES },
  };
}

function quotationSample(): UniversalDocumentPayload {
  return {
    ...invoiceSample(),
    title: "Quotation",
    subtitle: "QTN-20260724-0930-217",
    badge: { label: "Awaiting response", tone: "warning" },
    meta: [
      { label: "Quotation No.", value: "QTN-20260724-0930-217" },
      { label: "Date", value: "2026-07-24" },
      { label: "Valid Until", value: "2026-08-24" },
      { label: "Currency", value: "USD" },
    ],
    parties: [{ ...SAMPLE_PARTY, title: "Prepared For" }],
    totals: [
      { label: "Subtotal", value: "USD 670.00" },
      { label: "Tax", value: "USD 93.00" },
      { label: "Total", value: "USD 763.00", emphasis: true },
    ],
    notes: ["This quotation is valid until 2026-08-24."],
  };
}

function receiptSample(): UniversalDocumentPayload {
  return {
    title: "Payment Receipt",
    subtitle: "REC-20260724-1130-664",
    badge: { label: "Payment received", tone: "positive" },
    meta: [
      { label: "Receipt No.", value: "REC-20260724-1130-664" },
      { label: "Date", value: "2026-07-24" },
      { label: "Method", value: "Bank transfer" },
    ],
    parties: [{ ...SAMPLE_PARTY, title: "Received From" }],
    totals: [{ label: "Amount received", value: "USD 300.00", emphasis: true }],
    notes: ["Thank you for your payment. Applied to invoice INV-20260724-1015-482."],
    record: {
      sections: [],
      lineColumns: [
        { key: "description", label: "Description" },
        { key: "method", label: "Method" },
        { key: "reference", label: "Reference" },
        { key: "amount", label: "Amount" },
      ],
      lines: [
        { description: "Payment against invoice INV-20260724-1015-482", method: "Bank transfer", reference: "TRF-99812", amount: "300.00" },
      ],
    },
  };
}

function reportSample(): UniversalDocumentPayload {
  return {
    title: "Report",
    subtitle: "Sample export",
    meta: [
      { label: "Range", value: "2026-07-01 → 2026-07-24" },
      { label: "Rows", value: "3" },
    ],
    list: {
      columns: [
        { key: "date", label: "Date" },
        { key: "reference", label: "Reference" },
        { key: "status", label: "Status" },
        { key: "amount", label: "Amount" },
      ],
      rows: [
        { date: "2026-07-21", reference: "REF-0031", status: "COMPLETE", amount: "410.00" },
        { date: "2026-07-22", reference: "REF-0032", status: "COMPLETE", amount: "185.50" },
        { date: "2026-07-23", reference: "REF-0033", status: "PENDING", amount: "96.00" },
      ],
    },
  };
}

function dashboardSample(): UniversalDocumentPayload {
  return {
    title: "Executive Summary",
    subtitle: "Sample export",
    dashboard: {
      metrics: [
        { label: "Revenue", value: "USD 12,480", detail: "+8% vs last period" },
        { label: "Open Orders", value: "23" },
        { label: "Collections", value: "USD 9,210" },
      ],
      notes: ["Figures shown are sample data for template preview."],
    },
  };
}

/**
 * Iteration 5 — the school's paper, for the template editor's preview.
 *
 * Zimbabwean names, three terms, a levy and a boarding fee, because a preview
 * showing "Acme Retail (Pvt) Ltd" is one a bursar cannot judge their own
 * letterhead against.
 */
function feeInvoiceSample(): UniversalDocumentPayload {
  return {
    title: "Fee invoice",
    subtitle: "SFI-0042",
    badge: { label: "issued", tone: "warning" },
    meta: [
      { label: "Invoice No.", value: "SFI-0042" },
      { label: "Pupil", value: "Tendai Moyo" },
      { label: "Student number", value: "S1002" },
      { label: "Class", value: "Form 2 Blue" },
      { label: "Term", value: "Term 2" },
      { label: "Issued", value: "2026-05-08" },
      { label: "Due", value: "2026-06-05" },
    ],
    parties: [
      {
        title: "Bill to",
        lines: ["Rudo Moyo", "mother of Tendai Moyo", "14 Chiremba Rd, Harare", "0772 000 111"],
      },
    ],
    totals: [
      { label: "Subtotal", value: "USD 450.00" },
      { label: "Total", value: "USD 450.00" },
      { label: "Paid", value: "USD 180.00" },
      { label: "Balance due", value: "USD 270.00", emphasis: true },
    ],
    record: {
      sections: [],
      lineColumns: [
        { key: "feeCode", label: "Code" },
        { key: "description", label: "Description" },
        { key: "quantity", label: "Qty" },
        { key: "unitAmount", label: "Unit" },
        { key: "amount", label: "Amount" },
      ],
      lines: [
        { feeCode: "TUITION", description: "Tuition", quantity: "1.00", unitAmount: "400.00", amount: "400.00" },
        { feeCode: "DEV", description: "Development levy", quantity: "1.00", unitAmount: "50.00", amount: "50.00" },
      ],
    },
    notes: ["Fees are payable by the end of the second week of term."],
  };
}

function reportCardSample(): UniversalDocumentPayload {
  return {
    title: "Report card",
    subtitle: "Tendai Moyo — Term 2",
    meta: [
      { label: "Pupil", value: "Tendai Moyo" },
      { label: "Student number", value: "S1002" },
      { label: "Class", value: "Form 2 Blue" },
      { label: "Term", value: "Term 2" },
      { label: "Subjects", value: "4" },
      { label: "Average", value: "63.5" },
    ],
    record: {
      sections: [],
      lineColumns: [
        { key: "subject", label: "Subject" },
        { key: "score", label: "Mark" },
        { key: "grade", label: "Grade" },
        { key: "outcome", label: "Outcome" },
        { key: "remarks", label: "Remarks" },
      ],
      lines: [
        { subject: "Mathematics", score: "72.0", grade: "B", outcome: "Pass", remarks: "Strong on algebra." },
        { subject: "English Language", score: "64.0", grade: "C", outcome: "Pass", remarks: "" },
        { subject: "Combined Science", score: "58.0", grade: "C", outcome: "Pass", remarks: "" },
        { subject: "Shona", score: "60.0", grade: "C", outcome: "Pass", remarks: "" },
      ],
    },
    notes: ["Published marks only."],
  };
}

function classListSample(): UniversalDocumentPayload {
  return {
    title: "Form 2 Blue class list",
    subtitle: "Term 2",
    meta: [
      { label: "Class", value: "Form 2 Blue" },
      { label: "On the roll", value: "3" },
      { label: "Printed", value: "2026-05-08" },
    ],
    list: {
      columns: [
        { key: "no", label: "#" },
        { key: "studentNo", label: "Student no." },
        { key: "name", label: "Name" },
        { key: "stream", label: "Stream" },
        { key: "gender", label: "Sex" },
        { key: "boarding", label: "Boarding" },
        { key: "guardian", label: "Guardian" },
        { key: "phone", label: "Phone" },
      ],
      rows: [
        { no: "1", studentNo: "S1001", name: "Chirwa, Rudo", stream: "Blue", gender: "F", boarding: "Day", guardian: "Grace Chirwa", phone: "0772 000 112" },
        { no: "2", studentNo: "S1002", name: "Moyo, Tendai", stream: "Blue", gender: "M", boarding: "Boarder", guardian: "Rudo Moyo", phone: "0772 000 111" },
        { no: "3", studentNo: "S1003", name: "Nyoni, Farai", stream: "Blue", gender: "M", boarding: "Day", guardian: "Joseph Nyoni", phone: "0772 000 113" },
      ],
    },
  };
}

export function getSamplePayload(sourceKey: string): UniversalDocumentPayload {
  switch (sourceKey) {
    case "accounting.sales.invoice":
      return invoiceSample();
    case "accounting.sales.quotation":
      return quotationSample();
    case "accounting.sales.receipt":
      return receiptSample();
    case "accounting.sales.credit-note":
      return {
        ...quotationSample(),
        title: "Credit Note",
        subtitle: "CRN-20260724-002",
        badge: { label: "Issued", tone: "positive" },
        totals: [{ label: "Total credited", value: "USD 120.00", emphasis: true }],
        notes: ["Goods returned in good order."],
      };
    case "dashboard.executive-summary":
      return dashboardSample();
    case "schools.fee.invoice":
      return feeInvoiceSample();
    case "schools.fee.receipt":
      return {
        ...feeInvoiceSample(),
        title: "Fee receipt",
        subtitle: "SFR-0018",
        badge: { label: "Payment received", tone: "positive" },
        meta: [
          { label: "Receipt No.", value: "SFR-0018" },
          { label: "Pupil", value: "Tendai Moyo" },
          { label: "Student number", value: "S1002" },
          { label: "Received", value: "2026-05-20" },
          { label: "Method", value: "mobile money" },
          { label: "Reference", value: "EC-77120" },
        ],
        // A receipt acknowledges, it does not bill. The real resolver emits no
        // party block at all; the sample matches it rather than inheriting the
        // invoice's "Bill to".
        parties: [
          {
            title: "Received from",
            lines: ["Rudo Moyo", "mother of Tendai Moyo", "0772 000 111"],
          },
        ],
        totals: [{ label: "Amount received", value: "USD 180.00", emphasis: true }],
        record: {
          sections: [],
          lineColumns: [
            { key: "invoice", label: "Invoice" },
            { key: "term", label: "Term" },
            { key: "amount", label: "Amount" },
          ],
          lines: [{ invoice: "SFI-0042", term: "Term 2", amount: "180.00" }],
        },
        notes: [],
      };
    case "schools.fee.statement":
      return {
        ...feeInvoiceSample(),
        title: "Fee statement",
        subtitle: "Tendai Moyo",
        badge: undefined,
        parties: [],
        totals: [{ label: "Balance outstanding", value: "USD 270.00", emphasis: true }],
        record: {
          sections: [],
          lineColumns: [
            { key: "date", label: "Date" },
            { key: "reference", label: "Reference" },
            { key: "detail", label: "Detail" },
            { key: "charge", label: "Charged" },
            { key: "payment", label: "Paid" },
          ],
          lines: [
            { date: "2026-05-08", reference: "SFI-0042", detail: "Term 2 fees", charge: "450.00", payment: "" },
            { date: "2026-05-20", reference: "SFR-0018", detail: "Payment — mobile money", charge: "", payment: "180.00" },
          ],
        },
        notes: [],
      };
    case "schools.report-card":
      return reportCardSample();
    case "schools.admission-letter":
      return {
        title: "Offer of a place",
        subtitle: "Anesu Banda",
        badge: { label: "accepted", tone: "positive" },
        meta: [
          { label: "Application No.", value: "SAP-0031" },
          { label: "Pupil", value: "Anesu Banda" },
          { label: "Class", value: "Form 1" },
          { label: "Starting", value: "Term 3" },
          { label: "Decision date", value: "2026-05-02" },
        ],
        parties: [{ title: "To", lines: ["Grace Banda", "0772 000 114", "grace.banda@example.co.zw"] }],
        record: { sections: [] },
        notes: ["We are pleased to offer Anesu Banda a place in Form 1 from Term 3."],
      };
    case "schools.transfer-letter":
      return {
        title: "Transfer letter",
        subtitle: "Kudzai Ncube",
        meta: [
          { label: "Pupil", value: "Kudzai Ncube" },
          { label: "Student number", value: "S1006" },
          { label: "Date of birth", value: "2011-03-14" },
          { label: "Admitted", value: "2023-01-10" },
          { label: "Last class", value: "Form 3" },
          { label: "Last term", value: "Term 2" },
          { label: "Status", value: "withdrawn" },
        ],
        record: { sections: [] },
        totals: [{ label: "Fees outstanding", value: "USD 0.00" }],
        notes: [
          "This letter confirms that Kudzai Ncube was a pupil at this school.",
          "There is no outstanding fee balance on this pupil's account.",
        ],
      };
    case "schools.class-list":
      return classListSample();
    case "schools.attendance-register":
      return {
        title: "Form 2 Blue attendance register",
        subtitle: "Term 2",
        meta: [
          { label: "Class", value: "Form 2 Blue" },
          { label: "Pupils", value: "3" },
          { label: "Week beginning", value: "2026-05-11" },
        ],
        list: {
          columns: [
            { key: "no", label: "#" },
            { key: "studentNo", label: "Student no." },
            { key: "name", label: "Name" },
            { key: "mon", label: "Mon" },
            { key: "tue", label: "Tue" },
            { key: "wed", label: "Wed" },
            { key: "thu", label: "Thu" },
            { key: "fri", label: "Fri" },
          ],
          rows: [
            { no: "1", studentNo: "S1001", name: "Chirwa, Rudo", mon: "", tue: "", wed: "", thu: "", fri: "" },
            { no: "2", studentNo: "S1002", name: "Moyo, Tendai", mon: "", tue: "", wed: "", thu: "", fri: "" },
            { no: "3", studentNo: "S1003", name: "Nyoni, Farai", mon: "", tue: "", wed: "", thu: "", fri: "" },
          ],
        },
      };
    default:
      return reportSample();
  }
}
