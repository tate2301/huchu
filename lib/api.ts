import { fetchJson } from "@/lib/api-client";

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
};

export type Pagination<T> = {
  data: T[];
  pagination: PaginationMeta;
};

export type Site = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
  measurementUnit: string;
  isActive: boolean;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

export type EmployeeSummary = {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  passportPhotoUrl: string;
  villageOfOrigin: string;
  position: string;
  isActive: boolean;
  goldOwed: number;
  salaryOwed: number;
};

export type FixedSalary = {
  id: string;
  employeeId: string;
  monthlyAmount: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    name: string;
    employeeId: string;
    position: string;
    isActive: boolean;
  };
};

export type EmployeePayment = {
  id: string;
  employeeId: string;
  type: "GOLD" | "SALARY";
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  unit: string;
  paidAmount?: number | null;
  paidAt?: string | null;
  status: "DUE" | "PARTIAL" | "PAID";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    name: string;
    employeeId: string;
    position: string;
    isActive: boolean;
  };
  createdBy?: { id: string; name: string } | null;
};

export type SectionSummary = {
  id: string;
  name: string;
  siteId: string;
  isActive: boolean;
  site?: { name: string; code: string };
};

export type DowntimeCode = {
  id: string;
  code: string;
  description: string;
  siteId?: string | null;
  sortOrder: number;
};

export type Equipment = {
  id: string;
  equipmentCode: string;
  name: string;
  category: string;
  siteId?: string;
  site: { name: string; code: string };
  qrCode?: string | null;
  lastServiceDate?: string | null;
  nextServiceDue?: string | null;
  serviceHours?: number | null;
  serviceDays?: number | null;
  isActive: boolean;
};

export type WorkOrder = {
  id: string;
  issue: string;
  status: string;
  downtimeStart: string;
  downtimeEnd?: string | null;
  workDone?: string | null;
  partsUsed?: string | null;
  createdAt: string;
  technician?: { id: string; name: string; employeeId: string } | null;
  equipment: {
    id: string;
    name: string;
    equipmentCode: string;
    site: { name: string; code: string };
  };
};

export type InventoryItem = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  siteId?: string;
  locationId?: string;
  unit: string;
  currentStock: number;
  minStock?: number | null;
  maxStock?: number | null;
  unitCost?: number | null;
  location: { name: string };
  site: { name: string; code: string };
};

export type StockLocation = {
  id: string;
  name: string;
  siteId: string;
  isActive: boolean;
  site?: { name: string; code: string };
};

export type StockMovement = {
  id: string;
  movementType: string;
  quantity: number;
  unit: string;
  issuedTo?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  item: {
    name: string;
    itemCode: string;
    unit: string;
    site: { name: string; code: string };
    location: { name: string };
  };
  issuedBy?: { name: string } | null;
};

export type AttendanceRecord = {
  id: string;
  date: string;
  shift: "DAY" | "NIGHT";
  status: string;
  overtime?: number | null;
  notes?: string | null;
  site: { id: string; name: string; code: string };
  employee: { id: string; name: string; employeeId: string };
};

export type ShiftReportSummary = {
  id: string;
  date: string;
  shift: "DAY" | "NIGHT";
  siteId: string;
  crewCount: number;
  workType: string;
  status: string;
  site: { name: string; code: string };
  section?: { name: string } | null;
  groupLeader?: { name: string } | null;
  downtimeEvents?: Array<{
    id: string;
    durationHours: number;
    notes?: string | null;
    downtimeCode: { description: string; code: string };
  }>;
};

export type PlantReportDowntimeEvent = {
  id: string;
  durationHours: number;
  notes?: string | null;
  downtimeCode: { description: string; code: string };
};

export type PlantReport = {
  id: string;
  date: string;
  siteId: string;
  tonnesFed?: number | null;
  tonnesProcessed?: number | null;
  runHours?: number | null;
  dieselUsed?: number | null;
  grindingMedia?: number | null;
  reagentsUsed?: number | null;
  waterUsed?: number | null;
  goldRecovered?: number | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: { name: string; code: string };
  reportedBy?: { name: string } | null;
  downtimeEvents?: PlantReportDowntimeEvent[];
};

export type GoldPour = {
  id: string;
  batchId?: string;
  batchCode?: string;
  pourBarId: string;
  pourDate: string;
  grossWeight: number;
  estimatedPurity?: number | null;
  storageLocation: string;
  site: { name: string; code: string };
  witness1?: { name: string } | null;
  witness2?: { name: string } | null;
};

export type GoldDispatch = {
  id: string;
  batchId?: string;
  batchCode?: string;
  goldPourId: string;
  dispatchDate: string;
  courier: string;
  vehicle?: string | null;
  destination: string;
  sealNumbers: string;
  handedOverBy?: { name: string } | null;
  receivedBy?: string | null;
  notes?: string | null;
  warnings?: string[];
  goldPour: {
    id?: string;
    batchId?: string;
    batchCode?: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    site: { name: string; code: string };
  };
};

export type BuyerReceipt = {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  assayResult?: number | null;
  paidAmount: number;
  paymentMethod: string;
  paymentChannel?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  goldDispatch: {
    id: string;
    batchId?: string;
    batchCode?: string;
    dispatchDate: string;
    courier: string;
    goldPour: {
      id?: string;
      batchId?: string;
      batchCode?: string;
      pourBarId: string;
      grossWeight: number;
      pourDate: string;
      site: { name: string; code: string };
    };
  };
};

export type GoldShiftAllocationExpense = {
  id: string;
  type: string;
  weight: number;
};

export type GoldShiftAllocationWorkerShare = {
  id: string;
  shareWeight: number;
  employee: { id: string; name: string; employeeId: string };
};

export type GoldShiftAllocation = {
  id: string;
  date: string;
  shift: "DAY" | "NIGHT";
  siteId: string;
  totalWeight: number;
  netWeight: number;
  workerShareWeight: number;
  companyShareWeight: number;
  perWorkerWeight: number;
  payCycleWeeks: number;
  site: { name: string; code: string };
  shiftReport?: { id: string; status: string; crewCount: number } | null;
  expenses: GoldShiftAllocationExpense[];
  workerShares: GoldShiftAllocationWorkerShare[];
  createdBatchId?: string | null;
  createdBatchCode?: string | null;
  payoutRecordsCreated?: number;
  warnings?: string[];
  createdAt: string;
};

export type GoldCorrection = {
  id: string;
  pourId: string;
  entityType: "POUR" | "DISPATCH" | "RECEIPT";
  entityId: string;
  reason: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  createdAt: string;
  createdBy: { id: string; name: string };
  pour: {
    id: string;
    pourBarId: string;
    site: { id: string; name: string; code: string };
  };
};

export type PermitRecord = {
  id: string;
  permitType: string;
  permitNumber: string;
  siteId: string;
  issueDate: string;
  expiryDate: string;
  responsiblePerson: string;
  documentUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; code: string };
};

export type InspectionRecord = {
  id: string;
  siteId: string;
  inspectionDate: string;
  inspectorName: string;
  inspectorOrg: string;
  findings: string;
  actions?: string | null;
  actionsDue?: string | null;
  completedById?: string | null;
  completedAt?: string | null;
  documentUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; code: string };
  completedBy?: { id: string; name: string } | null;
};

export type IncidentRecord = {
  id: string;
  siteId: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  description: string;
  actionsTaken?: string | null;
  reportedBy: string;
  photoUrls?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: { id: string; name: string; code: string };
};

export type TrainingRecordSummary = {
  id: string;
  userId: string;
  trainingType: string;
  trainingDate: string;
  expiryDate?: string | null;
  certificateUrl?: string | null;
  trainedBy?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
};

export type DowntimeAnalytics = {
  siteId: string;
  startDate: string;
  endDate: string;
  totalDowntimeHours: number;
  totalIncidents: number;
  topCause: {
    description: string;
    code: string;
    hours: number;
    count: number;
  } | null;
  causes: Array<{
    description: string;
    code: string;
    hours: number;
    count: number;
  }>;
};

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchSites() {
  const response = await fetchJson<{ sites: Site[] }>("/api/sites");
  return response.sites;
}

export async function fetchUsers(
  params: {
    role?: string;
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<UserSummary>>(`/api/users${query}`);
}

export async function fetchEmployees(
  params: {
    active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<EmployeeSummary>>(`/api/employees${query}`);
}

export async function fetchFixedSalaries(
  params: {
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<FixedSalary>>(`/api/fixed-salaries${query}`);
}

export async function fetchEmployeePayments(
  params: {
    type?: "GOLD" | "SALARY";
    employeeId?: string;
    status?: "DUE" | "PARTIAL" | "PAID";
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<EmployeePayment>>(`/api/employee-payments${query}`);
}

export async function fetchSections(
  params: {
    siteId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<SectionSummary>>(`/api/sections${query}`);
}

export async function fetchDowntimeCodes(
  params: { siteId?: string; active?: boolean } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ codes: DowntimeCode[] }>(
    `/api/downtime-codes${query}`,
  );
  return response.codes;
}

export async function fetchDowntimeAnalytics(params: {
  siteId: string;
  startDate: string;
  endDate: string;
}) {
  const query = buildQuery(params);
  return fetchJson<DowntimeAnalytics>(`/api/analytics/downtime${query}`);
}

export async function fetchEquipment(
  params: { siteId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<Equipment>>(`/api/equipment${query}`);
}

export async function fetchWorkOrders(
  params: {
    equipmentId?: string;
    siteId?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<WorkOrder>>(`/api/work-orders${query}`);
}

export async function fetchInventoryItems(
  params: {
    siteId?: string;
    category?: string;
    lowStock?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<InventoryItem>>(`/api/inventory/items${query}`);
}

export async function fetchStockMovements(
  params: {
    siteId?: string;
    itemId?: string;
    movementType?: string;
    category?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<StockMovement>>(
    `/api/inventory/movements${query}`,
  );
}

export async function fetchStockLocations(
  params: {
    siteId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<StockLocation>>(`/api/stock-locations${query}`);
}

export async function fetchAttendance(
  params: {
    siteId?: string;
    employeeId?: string;
    shift?: string;
    status?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<AttendanceRecord>>(`/api/attendance${query}`);
}

export async function fetchShiftReports(
  params: {
    siteId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<ShiftReportSummary>>(
    `/api/shift-reports${query}`,
  );
}

export async function fetchPlantReports(
  params: {
    siteId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PlantReport>>(`/api/plant-reports${query}`);
}

export async function fetchGoldPours(
  params: { siteId?: string; page?: number; limit?: number } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPour>>(`/api/gold/pours${query}`);
}

export async function fetchGoldDispatches(
  params: {
    siteId?: string;
    goldPourId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldDispatch>>(`/api/gold/dispatches${query}`);
}

export async function fetchGoldReceipts(
  params: {
    siteId?: string;
    goldDispatchId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BuyerReceipt>>(`/api/gold/receipts${query}`);
}

export async function fetchGoldShiftAllocations(
  params: {
    siteId?: string;
    shift?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldShiftAllocation>>(
    `/api/gold/shift-allocations${query}`,
  );
}

export async function fetchGoldCorrections(
  params: {
    siteId?: string;
    pourId?: string;
    entityType?: "POUR" | "DISPATCH" | "RECEIPT";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldCorrection>>(`/api/gold/corrections${query}`);
}

export async function fetchPermits(
  params: {
    siteId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<PermitRecord>>(`/api/compliance/permits${query}`);
}

export async function fetchInspections(
  params: {
    siteId?: string;
    startDate?: string;
    endDate?: string;
    overdue?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<InspectionRecord>>(`/api/compliance/inspections${query}`);
}

export async function fetchIncidents(
  params: {
    siteId?: string;
    incidentType?: string;
    severity?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<IncidentRecord>>(`/api/compliance/incidents${query}`);
}

export async function fetchTrainingRecords(
  params: {
    userId?: string;
    startDate?: string;
    endDate?: string;
    expiringDays?: number;
    search?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<TrainingRecordSummary>>(`/api/compliance/training-records${query}`);
}

// ============================================
// CCTV API Functions
// ============================================

export type Camera = {
  id: string;
  name: string;
  channelNumber: number;
  nvrId: string;
  siteId: string;
  area: string;
  description?: string | null;
  hasPTZ: boolean;
  hasAudio: boolean;
  hasMotionDetect: boolean;
  hasLineDetect: boolean;
  isActive: boolean;
  isOnline: boolean;
  isRecording: boolean;
  lastSeen?: string | null;
  isHighSecurity: boolean;
  createdAt?: string;
  updatedAt?: string;
  nvr?: { id: string; name: string; ipAddress: string; isOnline: boolean; isActive: boolean };
  site?: { id: string; name: string; code: string };
};

export type NVR = {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  httpPort: number;
  siteId: string;
  manufacturer: string;
  model?: string | null;
  firmware?: string | null;
  username?: string;
  password?: string;
  isActive: boolean;
  isOnline: boolean;
  rtspPort: number;
  isapiEnabled: boolean;
  onvifEnabled: boolean;
  lastHeartbeat?: string | null;
  createdAt?: string;
  updatedAt?: string;
  site?: { id: string; name: string; code: string };
  _count?: { cameras: number };
};

export type CCTVEvent = {
  id: string;
  eventType: string;
  severity: string;
  eventTime: string;
  title: string;
  description?: string | null;
  isAcknowledged: boolean;
  linkedIncidentId?: string | null;
  notes?: string | null;
  camera?: { id: string; name: string; area: string; site: { id: string; name: string; code: string } };
  nvr?: { id: string; name: string; siteId: string };
};

export type CCTVStreamSession = {
  id: string;
  cameraId: string;
  siteId: string;
  userId: string;
  streamType: string;
  protocol: "WEBRTC" | "HLS";
  status: "ACTIVE" | "STOPPED" | "FAILED";
  playUrl?: string | null;
  purpose?: string | null;
  clientMeta?: string | null;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  camera?: {
    id: string;
    name: string;
    area: string;
    isOnline?: boolean;
    nvr?: { id: string; name: string; isOnline?: boolean };
    site: { id: string; name: string; code: string };
  };
  user?: { id: string; name: string; email: string };
};

export type CCTVAccessLog = {
  id: string;
  cameraId: string;
  userId?: string | null;
  accessType: string;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  ipAddress?: string | null;
  purpose?: string | null;
  notes?: string | null;
  camera: {
    id: string;
    name: string;
    area: string;
    site: { id: string; name: string; code: string };
  };
  user?: { id: string; name: string; email: string } | null;
};

export type PlaybackClip = {
  startTime: string;
  endTime: string;
  duration: number;
  fileSize: number;
  playbackUri: string;
  recordingType: string;
};

export type PlaybackSearchResponse = {
  clips: PlaybackClip[];
  totalClips: number;
  pagination: PaginationMeta;
  camera: {
    id: string;
    name: string;
    area: string;
    site: { id: string; name: string; code: string };
  };
  searchParams: {
    startTime: string;
    endTime: string;
    recordType: string;
  };
  isapiSearchXML: string;
  note: string;
};

export type StartStreamSessionResponse = {
  session: CCTVStreamSession;
  token: string;
  rtspUrl: string;
  expiresAt: string;
  protocol: "WEBRTC" | "HLS";
  playUrl: string | null;
  fallbackPlayUrl: string | null;
  gatewayConfigured: boolean;
};

export type StreamProfileResponse = {
  session: CCTVStreamSession;
  token: string;
  rtspUrl: string;
  playUrl: string | null;
  fallbackPlayUrl: string | null;
  protocol: "WEBRTC" | "HLS";
  expiresAt: string;
};

export async function fetchCameras(
  params: {
    siteId?: string;
    area?: string;
    isOnline?: boolean;
    nvrId?: string;
    isHighSecurity?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<Camera>>(`/api/cctv/cameras${query}`);
}

export async function fetchNVRs(
  params: {
    siteId?: string;
    isOnline?: boolean;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<NVR>>(`/api/cctv/nvrs${query}`);
}

export async function fetchCCTVEvents(
  params: {
    siteId?: string;
    cameraId?: string;
    eventType?: string;
    severity?: string;
    isAcknowledged?: boolean;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);

  return fetchJson<Pagination<CCTVEvent>>(`/api/cctv/events${query}`);
}

export async function fetchCCTVStreamSessions(
  params: {
    siteId?: string;
    cameraId?: string;
    status?: "ACTIVE" | "STOPPED" | "FAILED";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CCTVStreamSession>>(`/api/cctv/streams/sessions${query}`);
}

export async function startCCTVStreamSession(input: {
  cameraId: string;
  streamType?: "main" | "sub" | "third";
  preferredProtocol?: "WEBRTC" | "HLS";
  purpose?: string;
  clientMeta?: unknown;
  expiresInMinutes?: number;
}) {
  return fetchJson<StartStreamSessionResponse>("/api/cctv/streams/session/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function stopCCTVStreamSession(sessionId: string) {
  return fetchJson<{ session: CCTVStreamSession }>("/api/cctv/streams/session/stop", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function switchCCTVStreamProfile(input: {
  sessionId: string;
  streamType: "main" | "sub" | "third";
  preferredProtocol?: "WEBRTC" | "HLS";
}) {
  return fetchJson<StreamProfileResponse>("/api/cctv/streams/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchCCTVAccessLogs(
  params: {
    siteId?: string;
    cameraId?: string;
    accessType?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<CCTVAccessLog>>(`/api/cctv/access-logs${query}`);
}

export async function searchCCTVPlayback(input: {
  cameraId: string;
  startTime: string;
  endTime: string;
  recordType?: string;
  purpose?: string;
  page?: number;
  limit?: number;
}) {
  return fetchJson<PlaybackSearchResponse>("/api/cctv/playback/search", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
