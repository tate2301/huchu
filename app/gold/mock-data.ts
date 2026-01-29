// Mock data for demonstration
export const mockPours = [
  {
    id: "PB-123456",
    date: "2026-01-08",
    site: "Mine Site 1",
    weight: 45.5,
    status: "dispatched",
  },
  {
    id: "PB-123457",
    date: "2026-01-07",
    site: "Mine Site 2",
    weight: 38.2,
    status: "in-storage",
  },
  {
    id: "PB-123458",
    date: "2026-01-06",
    site: "Mine Site 1",
    weight: 52.1,
    status: "received",
  },
];

export const mockAuditLog = [
  {
    timestamp: "2026-01-08 14:30",
    action: "Pour Recorded",
    user: "John Doe",
    details: "PB-123456, 45.5g",
  },
  {
    timestamp: "2026-01-08 15:45",
    action: "Dispatch Created",
    user: "Sarah Smith",
    details: "PB-123456 to Buyer A",
  },
  {
    timestamp: "2026-01-08 18:20",
    action: "Receipt Confirmed",
    user: "Mike Johnson",
    details: "Assay: 42.3g pure",
  },
  {
    timestamp: "2026-01-07 10:15",
    action: "Pour Recorded",
    user: "John Doe",
    details: "PB-123457, 38.2g",
  },
];
