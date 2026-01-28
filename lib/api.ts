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
  unit: string
  currentStock: number
  minStock?: number | null
  maxStock?: number | null
  unitCost?: number | null
  location: { name: string }
  site: { name: string; code: string }
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
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<StockMovement>>(`/api/inventory/movements${query}`)
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

// ============================================
// CCTV API Functions
// ============================================

export type Camera = {
  id: string
  name: string
  channelNumber: number
  nvrId: string
  siteId: string
  area: string
  description?: string | null
  hasPTZ: boolean
  hasAudio: boolean
  hasMotionDetect: boolean
  hasLineDetect: boolean
  isOnline: boolean
  isRecording: boolean
  lastSeen?: string | null
  isHighSecurity: boolean
  nvr?: { name: string; ipAddress: string; isOnline: boolean }
  site?: { name: string; code: string }
}

export type NVR = {
  id: string
  name: string
  ipAddress: string
  port: number
  httpPort: number
  siteId: string
  manufacturer: string
  model?: string | null
  isOnline: boolean
  lastHeartbeat?: string | null
  site?: { name: string; code: string }
  _count?: { cameras: number }
}

export type CCTVEvent = {
  id: string
  eventType: string
  severity: string
  eventTime: string
  title: string
  description?: string | null
  isAcknowledged: boolean
  camera?: { name: string; area: string; site: { name: string } }
}

export async function fetchCameras(params: {
  siteId?: string
  area?: string
  isOnline?: boolean
  nvrId?: string
  isHighSecurity?: boolean
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<Camera>>(`/api/cctv/cameras${query}`)
}

export async function fetchNVRs(params: {
  siteId?: string
  isOnline?: boolean
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<NVR>>(`/api/cctv/nvrs${query}`)
}

export async function fetchCCTVEvents(params: {
  cameraId?: string
  eventType?: string
  severity?: string
  isAcknowledged?: boolean
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
} = {}) {
  const query = buildQuery(params)
  return fetchJson<Pagination<CCTVEvent>>(`/api/cctv/events${query}`)
}
