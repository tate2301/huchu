import { differenceInMinutes, format } from "date-fns"

export const formatDate = (value?: string | null) => {
  if (!value) return "—"
  return format(new Date(value), "yyyy-MM-dd")
}

export const getDowntimeHours = (start: string, end?: string | null) => {
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  const minutes = Math.max(0, differenceInMinutes(endDate, startDate))
  return (minutes / 60).toFixed(1)
}

export const equipmentStatus = (item: {
  isActive: boolean
  nextServiceDue?: string | null
}) => {
  if (!item.isActive) {
    return { label: "Down", className: "bg-destructive/10 text-destructive" }
  }
  if (item.nextServiceDue && new Date(item.nextServiceDue) < new Date()) {
    return { label: "Needs Service", className: "bg-amber-100 text-amber-800" }
  }
  return { label: "Operational", className: "bg-emerald-100 text-emerald-800" }
}
