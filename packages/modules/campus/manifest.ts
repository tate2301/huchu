import type { ModuleManifest } from "@corelithzw/platform/manifest";
import { letterTemplate, recordTemplate, reportTemplate } from "@corelithzw/module-documents/default-template-catalog";

/**
 * Campus: the school — pupils, guardians, teachers, the academic ladder,
 * boarding, fees and the portals.
 *
 * The manifest id is "schools": the schema's module name, which the record
 * types, features and routes carry; the product the module makes is Campus,
 * and the package is named for it. Data only.
 */
export const manifest: ModuleManifest = {
  id: "schools",
  requires: ["records", "documents", "books", "offline", "people", "notifications"],
  records: {
    // The academic ladder (classes, subjects) moved under Management > Master
    // Data; the old `/schools/classes` routes still redirect there.
    types: [
      {
        type: "STUDENT",
        label: "Student",
        labelPlural: "Students",
        kind: "student",
        isPerson: true,
        indexHref: "/schools/students",
        href: "/schools/students/{id}",
        apiPath: "/api/v2/schools/students/{id}",
        queryKey: [
          "schools",
          "student",
          "{id}",
        ],
      },
      {
        type: "GUARDIAN",
        label: "Guardian",
        labelPlural: "Guardians",
        kind: "guardian",
        isPerson: true,
        indexHref: "/schools/guardians",
        href: "/schools/guardians/{id}",
        apiPath: "/api/v2/schools/guardians/{id}",
        queryKey: [
          "schools",
          "guardian",
          "{id}",
        ],
      },
      {
        type: "TEACHER",
        label: "Teacher",
        labelPlural: "Teachers",
        kind: "teacher",
        isPerson: true,
        indexHref: "/schools/teachers",
        href: "/schools/teachers/{id}",
        apiPath: "/api/v2/schools/teachers/{id}",
        queryKey: [
          "schools",
          "teacher",
          "{id}",
        ],
      },
      {
        type: "CLASS",
        label: "Class",
        labelPlural: "Classes",
        kind: "class",
        isPerson: false,
        indexHref: "/management/master-data/schools/classes",
        href: "/management/master-data/schools/classes/{id}",
        apiPath: "/api/v2/schools/classes/{id}",
        queryKey: [
          "schools",
          "class",
          "{id}",
        ],
      },
      {
        type: "SUBJECT",
        label: "Subject",
        labelPlural: "Subjects",
        kind: "subject",
        isPerson: false,
        indexHref: "/management/master-data/schools/subjects",
        href: "/management/master-data/schools/subjects/{id}",
        apiPath: "/api/v2/schools/subjects/{id}",
        queryKey: [
          "schools",
          "subject",
          "{id}",
        ],
      },
      {
        type: "HOSTEL",
        label: "Hostel",
        labelPlural: "Hostels",
        kind: "hostel",
        isPerson: false,
        indexHref: "/schools/boarding",
        href: "/schools/boarding/{id}",
        apiPath: "/api/v2/schools/boarding/hostels/{id}",
        queryKey: [
          "schools",
          "hostel",
          "{id}",
        ],
      },
    ],
  },
  documents: {
    templates: [
      {
        key: "schools.fee.invoice",
        sourceKey: "schools.fee.invoice",
        documentType: "SALES_INVOICE",
        targetType: "RECORD",
        name: "School Fee Invoice Default",
        description: "Termly fee invoice addressed to the family.",
        schema: recordTemplate("Fee Invoice"),
      },
      {
        key: "schools.fee.receipt",
        sourceKey: "schools.fee.receipt",
        documentType: "SALES_RECEIPT",
        targetType: "RECORD",
        name: "School Fee Receipt Default",
        description: "Proof of a fee payment, showing what it was put against.",
        schema: recordTemplate("Fee Receipt"),
      },
      {
        key: "schools.fee.statement",
        sourceKey: "schools.fee.statement",
        documentType: "GENERIC_RECORD",
        targetType: "RECORD",
        name: "School Fee Statement Default",
        description: "Every charge and payment for one pupil, with the closing balance.",
        schema: recordTemplate("Fee Statement"),
      },
      {
        key: "schools.report-card",
        sourceKey: "schools.report-card",
        documentType: "GENERIC_RECORD",
        targetType: "RECORD",
        name: "School Report Card Default",
        description: "A term's published marks per subject, with the pass outcome.",
        schema: letterTemplate("Report Card"),
      },
      {
        key: "schools.admission-letter",
        sourceKey: "schools.admission-letter",
        documentType: "GENERIC_RECORD",
        targetType: "RECORD",
        name: "School Admission Letter Default",
        description: "The offer of a place, addressed to the parent who applied.",
        schema: letterTemplate("Offer of a Place"),
      },
      {
        key: "schools.transfer-letter",
        sourceKey: "schools.transfer-letter",
        documentType: "GENERIC_RECORD",
        targetType: "RECORD",
        name: "School Transfer Letter Default",
        description: "Confirmation a pupil was here, with any fees still outstanding.",
        schema: letterTemplate("Transfer Letter"),
      },
      {
        key: "schools.class-list",
        sourceKey: "schools.class-list",
        documentType: "REPORT_TABLE",
        targetType: "LIST",
        name: "School Class List Default",
        description: "A class's roll with guardians and phone numbers.",
        schema: reportTemplate("Class List"),
      },
      {
        key: "schools.attendance-register",
        sourceKey: "schools.attendance-register",
        documentType: "REPORT_TABLE",
        targetType: "LIST",
        name: "School Attendance Register Default",
        description: "A blank week's register, for the days the line is down.",
        schema: reportTemplate("Attendance Register"),
      },
    ],
  },
};
