"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  fetchSchoolsStudents,
  type SchoolsStudentRecord,
} from "@/lib/schools/admin-v2";

type DocumentView = "report-card" | "fee-invoice" | "class-list" | "attendance-register";

function usePrint(ref: React.RefObject<HTMLDivElement | null>) {
  return () => {
    if (!ref.current) return;
    const content = ref.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Document</title>
          <style>
            body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-size: 12px; }
            th { background-color: #f9fafb; font-weight: 600; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };
}

function ReportCardPreview({ student }: { student: SchoolsStudentRecord | null }) {
  const printRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = usePrint(printRef);

  if (!student) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Select a student to generate a report card.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Report Card Preview</h3>
        <Button size="sm" onClick={handlePrint}>
          Print / Save PDF
        </Button>
      </div>
      <div ref={printRef}>
        <PdfTemplate
          title="Student Report Card"
          subtitle={`${student.firstName} ${student.lastName}`}
          meta={[
            { label: "Student No", value: student.studentNo },
            { label: "Admission No", value: student.admissionNo || "-" },
            { label: "Class", value: student.currentClass?.name ?? "-" },
            { label: "Stream", value: student.currentStream?.name ?? "-" },
            { label: "Status", value: student.status },
            { label: "Boarding", value: student.isBoarding ? "Boarder" : "Day Scholar" },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Subject</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "center" }}>Mark</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "center" }}>Grade</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Comment</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} style={{ border: "1px solid #e5e7eb", padding: "12px 8px", textAlign: "center", color: "#6b7280" }}>
                  Results data will be populated from the results module for the selected term.
                </td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: "24px", borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6b7280" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Class Teacher</div>
                <div style={{ marginTop: "24px", borderTop: "1px solid #000", width: "200px" }}>Signature</div>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>Head Teacher</div>
                <div style={{ marginTop: "24px", borderTop: "1px solid #000", width: "200px" }}>Signature</div>
              </div>
            </div>
          </div>
        </PdfTemplate>
      </div>
    </div>
  );
}

function FeeInvoicePreview({ student }: { student: SchoolsStudentRecord | null }) {
  const printRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = usePrint(printRef);

  if (!student) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Select a student to generate a fee invoice.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Fee Invoice Preview</h3>
        <Button size="sm" onClick={handlePrint}>
          Print / Save PDF
        </Button>
      </div>
      <div ref={printRef}>
        <PdfTemplate
          title="Fee Invoice"
          subtitle={`${student.firstName} ${student.lastName}`}
          meta={[
            { label: "Student No", value: student.studentNo },
            { label: "Class", value: student.currentClass?.name ?? "-" },
            { label: "Invoice Date", value: new Date().toLocaleDateString() },
            { label: "Due Date", value: "-" },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Description</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>Tuition Fee</td>
                <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>-</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>Boarding Fee</td>
                <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>-</td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>Total Due</td>
                <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>-</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: "16px", fontSize: "11px", color: "#6b7280" }}>
            <p>Fee invoice amounts will be populated from the fee structures configured for the current term.</p>
          </div>
        </PdfTemplate>
      </div>
    </div>
  );
}

function ClassListPreview({ students }: { students: SchoolsStudentRecord[] }) {
  const printRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = usePrint(printRef);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Class List Preview</h3>
        <Button size="sm" onClick={handlePrint}>
          Print / Save PDF
        </Button>
      </div>
      <div ref={printRef}>
        <PdfTemplate
          title="Class List"
          subtitle="All Active Students"
          meta={[
            { label: "Total Students", value: String(students.length) },
            { label: "Date", value: new Date().toLocaleDateString() },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>#</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Student No</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Name</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Class</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Stream</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "6px 8px", textAlign: "left" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ border: "1px solid #e5e7eb", padding: "12px 8px", textAlign: "center", color: "#6b7280" }}>
                    No students found.
                  </td>
                </tr>
              ) : (
                students.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>{i + 1}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px", fontFamily: "monospace" }}>{s.studentNo}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>{s.firstName} {s.lastName}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>{s.currentClass?.name ?? "-"}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>{s.currentStream?.name ?? "-"}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>{s.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PdfTemplate>
      </div>
    </div>
  );
}

function AttendanceRegisterPreview({ students }: { students: SchoolsStudentRecord[] }) {
  const printRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = usePrint(printRef);

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Attendance Register Preview</h3>
        <Button size="sm" onClick={handlePrint}>
          Print / Save PDF
        </Button>
      </div>
      <div ref={printRef}>
        <PdfTemplate
          title="Attendance Register"
          subtitle="Weekly Attendance Sheet"
          meta={[
            { label: "Week Of", value: new Date().toLocaleDateString() },
            { label: "Total Students", value: String(students.length) },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ border: "1px solid #e5e7eb", padding: "4px 6px", textAlign: "left" }}>#</th>
                <th style={{ border: "1px solid #e5e7eb", padding: "4px 6px", textAlign: "left" }}>Name</th>
                {weekDays.map((day) => (
                  <th key={day} style={{ border: "1px solid #e5e7eb", padding: "4px 6px", textAlign: "center", minWidth: "40px" }}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={2 + weekDays.length} style={{ border: "1px solid #e5e7eb", padding: "12px 8px", textAlign: "center", color: "#6b7280" }}>
                    No students found.
                  </td>
                </tr>
              ) : (
                students.map((s, i) => (
                  <tr key={s.id}>
                    <td style={{ border: "1px solid #e5e7eb", padding: "4px 6px" }}>{i + 1}</td>
                    <td style={{ border: "1px solid #e5e7eb", padding: "4px 6px" }}>{s.firstName} {s.lastName}</td>
                    {weekDays.map((day) => (
                      <td key={day} style={{ border: "1px solid #e5e7eb", padding: "4px 6px", textAlign: "center" }}>&nbsp;</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PdfTemplate>
      </div>
    </div>
  );
}

export function SchoolDocumentsContent() {
  const [activeView, setActiveView] = useState<DocumentView>("report-card");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "documents"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 200 }),
  });

  const students = studentsQuery.data?.data ?? [];
  const selectedStudent = students.find((s) => s.id === selectedStudentId) ?? null;

  const filteredStudents = searchTerm
    ? students.filter(
        (s) =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.studentNo.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : students;

  const hasError = studentsQuery.error;

  return (
    <div className="space-y-4">
      {hasError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load student data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(studentsQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "report-card", label: "Report Cards" },
          { id: "fee-invoice", label: "Fee Invoices" },
          { id: "class-list", label: "Class Lists" },
          { id: "attendance-register", label: "Attendance Registers" },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as DocumentView)}
        railLabel="Document Types"
      >
        {activeView === "report-card" || activeView === "fee-invoice" ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Select Student</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="doc-student-search">Search students</Label>
                    <Input
                      id="doc-student-search"
                      placeholder="Search by name or student number..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {studentsQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground py-2">Loading students...</div>
                    ) : filteredStudents.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-2">No students found.</div>
                    ) : (
                      filteredStudents.slice(0, 20).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-accent transition-colors ${
                            selectedStudentId === s.id ? "bg-accent font-medium" : ""
                          }`}
                          onClick={() => setSelectedStudentId(s.id)}
                        >
                          <span className="font-mono text-xs text-muted-foreground">{s.studentNo}</span>{" "}
                          {s.firstName} {s.lastName}
                          {s.currentClass ? (
                            <Badge variant="outline" className="ml-2">{s.currentClass.name}</Badge>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {activeView === "report-card" ? (
              <ReportCardPreview student={selectedStudent} />
            ) : (
              <FeeInvoicePreview student={selectedStudent} />
            )}
          </div>
        ) : null}

        {activeView === "class-list" ? (
          <ClassListPreview students={filteredStudents} />
        ) : null}

        {activeView === "attendance-register" ? (
          <AttendanceRegisterPreview students={filteredStudents} />
        ) : null}
      </VerticalDataViews>
    </div>
  );
}
