import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Campus: the school — pupils, guardians, teachers, the academic ladder,
 * boarding, fees and the portals.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "schools",
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
};
