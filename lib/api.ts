import { fetchJson } from "@/lib/api-client"

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  pages: number
  hasMore: boolean
}

export type Pagination<T> = {
  data: T[]
  pagination: PaginationMeta
}

export type Site = {
  id: string
  name: string
  code: string
  location?: string | null
  measurementUnit: string
  isActive: boolean
}

export type UserSummary = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
}

export type EmployeeSummary = {
  id: string
  employeeId: string
  name: string
  phone: string
  nextOfKinName: string
  nextOfKinPhone: string
  passportPhotoUrl: string
  villageOfOrigin: string
  position: string
  isActive: boolean
}

export type SectionSummary = {
  id: string
  name: string
  siteId: string
  isActive: boolean
  site?: { name: string; code: string }
}

export type DowntimeCode = {
  id: string
  code: string
  description: string
  siteId?: string | null
  sortOrder: number
}

export type Equipment = {
  id: string
  equipmentCode: string
  name: string
  category: string
  siteId?: string
  site: { name: string; code: string }
  qrCode?: string | null
  lastServiceDate?: string | null
  nextServiceDue?: string | null
  serviceHours?: number | null
  serviceDays?: number | null
  isActive: boolean
}

export type WorkOrder = {
  id: string
  issue: string
  status: string
  downtimeStart: string
  downtimeEnd?: string | null
  workDone?: string | null
  partsUsed?: string | null
  createdAt: string
  technician?: { name: string } | null
  equipment: {
    id: string
    name: string
    equipmentCode: string
    site: { name: string; code: string }
  }
}

export type InventoryItem = {
  id: string
  itemCode: string
  name: string
  category: string
  siteId?: string
  locationId?: string
  unit: string
  currentStock: number
  minStock?: number | null
  maxStock?: number | null
  unitCost?: number | null
  location: { name: string }
  site: { name: string; code: string }
}

export type StockLocation = {
  id: string
  name: string
  siteId: string
  isActive: boolean
  site?: { name: string; code: string }
}

export type StockMovement = {
  id: string
  movementType: string
  quantity: number
  unit: string
  issuedTo?: string | null
  requestedBy?: string | null
  approvedBy?: string | null
  notes?: string | null
  createdAt: string
  item: {
    name: string
    itemCode: string
    unit: string
    site: { name: string; code: string }
    location: { name: string }
  }
  issuedBy?: { name: string } | null
}

export type AttendanceRecord = {
  id: string
  date: string
  shift: "DAY" | "NIGHT"
  status: string
  overtime?: number | null
  notes?: string | null
  site: { id: string; name: string; code: string }
  employee: { id: string; name: string; employeeId: string }
}

export type ShiftReportSummary = {
  id: string
  date: string
  shift: "DAY" | "NIGHT"
  siteId: string
  crewCount: number
  workType: string
  status: string
  site: { name: string; code: string }
  section?: { name: string } | null
  groupLeader?: { name: string } | null
}

export type GoldPour = {
  id: string
  pourBarId: string
  pourDate: string
  grossWeight: number
  estimatedPurity?: number | null
  storageLocation: string
  site: { name: string; code: string }
  witness1?: { name: string } | null
  witness2?: { name: string } | null
}

export type GoldDispatch = {
  id: string
  goldPourId: string
  dispatchDate: string
  courier: string
  vehicle?: string | null
  destination: string
  sealNumbers: string
  handedOverBy?: { name: string } | null
  receivedBy?: string | null
  notes?: string | null
  goldPour: {
    pourBarId: string
    pourDate: string
    grossWeight: number
    site: { name: string; code: string }
  }
}

export type BuyerReceipt = {
  id: string
  receiptNumber: string
  receiptDate: string
  assayResult?: number | null
  paidAmount: number
  paymentMethod: string
  paymentChannel?: string | null
  paymentReference?: string | null
  notes?: string | null
  goldDispatch: {
    id: string
    dispatchDate: string
    courier: string
    goldPour: {
      pourBarId: string
      grossWeight: number
      pourDate: string
      site: { name: string; code: string }
    }
  }
}

export type GoldShiftAllocationExpense = {
  id: string
  type: string
  weight: number
}

export type GoldShiftAllocationWorkerShare = {
  id: string
  shareWeight: number
  employee: { id: string; name: string; employeeId: string }
}

export type GoldShiftAllocation = {
  id: string
  date: string
  shift: "DAY" | "NIGHT"
  siteId: string
  totalWeight: number
  netWeight: number
  workerShareWeight: number
  companyShareWeight: number
  perWorkerWeight: number
  payCycleWeeks: number
  site: { name: string; code: string }
  shiftReport?: { id: string; status: string; crewCount: number } | null
  expenses: GoldShiftAllocationExpense[]
  workerShares: GoldShiftAllocationWorkerShare[]
  createdAt: string
}

export type DowntimeAnalytics = {
  siteId: string
  startDate: string
  endDate: string
  totalDowntimeHours: number
  totalIncidents: number
  topCause: { description: string; code: string; hours: number; count: number } | null
  causes: Array<{ description: string; code: string; hours: number; count: number }>
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return
    searchParams.set(key, String(value))
  })
  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

export async function fetchSites() {
  const response = await fetchJson<{ sites: Site[] }>("/api/sites")
  return response.sites
}

export async function fetchUsers(params: {
  role?: string
  active?: boolean
  search?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<UserSummary>>(`/api/users${query}`)
}

export async function fetchEmployees(params: {
  active?: boolean
  search?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<EmployeeSummary>>(`/api/employees${query}`)
}

export async function fetchSections(params: {
  siteId?: string
  active?: boolean
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<SectionSummary>>(`/api/sections${query}`)
}

export async function fetchDowntimeCodes(params: { siteId?: string; active?: boolean } = {}) {
  const query = buildQuery(params)
  const response = await fetchJson<{ codes: DowntimeCode[] }>(`/api/downtime-codes${query}`)
  return response.codes
}

export async function fetchDowntimeAnalytics(params: {
  siteId: string
  startDate: string
  endDate: string
}) {
  const query = buildQuery(params)
  return fetchJson<DowntimeAnalytics>(`/api/analytics/downtime${query}`)
}

export async function fetchEquipment(params: { siteId?: string; page?: number; limit?: number } = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<Equipment>>(`/api/equipment${query}`)
}

export async function fetchWorkOrders(params: {
  equipmentId?: string
  siteId?: string
  status?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<WorkOrder>>(`/api/work-orders${query}`)
}

export async function fetchInventoryItems(params: {
  siteId?: string
  category?: string
  lowStock?: boolean
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<InventoryItem>>(`/api/inventory/items${query}`)
}

export async function fetchStockMovements(params: {
  siteId?: string
  itemId?: string
  movementType?: string
  category?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<StockMovement>>(`/api/inventory/movements${query}`)
}

export async function fetchStockLocations(params: {
  siteId?: string
  active?: boolean
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<StockLocation>>(`/api/stock-locations${query}`)
}

export async function fetchAttendance(params: {
  siteId?: string
  employeeId?: string
  shift?: string
  status?: string
  date?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<AttendanceRecord>>(`/api/attendance${query}`)
}

export async function fetchShiftReports(params: {
  siteId?: string
  startDate?: string
  endDate?: string
  status?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<ShiftReportSummary>>(`/api/shift-reports${query}`)
}

export async function fetchGoldPours(params: { siteId?: string; page?: number; limit?: number } = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<GoldPour>>(`/api/gold/pours${query}`)
}

export async function fetchGoldDispatches(params: {
  siteId?: string
  goldPourId?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<GoldDispatch>>(`/api/gold/dispatches${query}`)
}

export async function fetchGoldReceipts(params: {
  siteId?: string
  goldDispatchId?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<BuyerReceipt>>(`/api/gold/receipts${query}`)
}

export async function fetchGoldShiftAllocations(params: {
  siteId?: string
  shift?: string
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<GoldShiftAllocation>>(`/api/gold/shift-allocations${query}`)
}
