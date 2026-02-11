import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type SearchParams = Record<string, string | string[] | undefined>

function firstValue(value: string | string[] | undefined) {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function buildQueryString(searchParams: SearchParams) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (!value) continue
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry)
    } else {
      params.set(key, value)
    }
  }
  return params.toString()
}

export default async function PayrollRootPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession(authOptions)
  const role = session?.user?.role
  const companyId = session?.user?.companyId
  const resolvedSearchParams = await searchParams

  if (!session?.user?.id || !companyId) {
    redirect("/login")
  }

  let targetPath =
    role === "CLERK" ? "/human-resources/payroll/salary" : "/human-resources/payroll/gold"

  const runId = firstValue(resolvedSearchParams.runId)
  const adjustmentId = firstValue(resolvedSearchParams.adjustmentId)

  if (runId) {
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, companyId },
      select: { domain: true },
    })
    if (run?.domain === "PAYROLL") targetPath = "/human-resources/payroll/salary"
    if (run?.domain === "GOLD_PAYOUT") targetPath = "/human-resources/payroll/gold"
  } else if (adjustmentId) {
    const adjustment = await prisma.adjustmentEntry.findFirst({
      where: { id: adjustmentId, companyId },
      select: {
        payrollRun: { select: { domain: true } },
        disbursementBatch: { select: { payrollRun: { select: { domain: true } } } },
      },
    })
    const domain =
      adjustment?.payrollRun?.domain ?? adjustment?.disbursementBatch?.payrollRun?.domain
    if (domain === "PAYROLL") targetPath = "/human-resources/payroll/salary"
    if (domain === "GOLD_PAYOUT") targetPath = "/human-resources/payroll/gold"
  }

  const queryString = buildQueryString(resolvedSearchParams)
  redirect(queryString ? `${targetPath}?${queryString}` : targetPath)
}
