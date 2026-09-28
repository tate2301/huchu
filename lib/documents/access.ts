/**
 * Who may see an export once it has been made.
 *
 * A list export is a copy of whatever its requester was allowed to read, so
 * it belongs to them. Being in the same company is not enough: a sales rep's
 * export of their own pipeline is not the next rep's to download, and an
 * owner's export of every account's balance is not a rep's. Managers may see
 * any job in the company, which is what lets them chase a stuck one.
 */
type Reader = { id: string; role: string; companyId: string };
type Job = { companyId: string; requestedById: string | null };

const MANAGER_ROLES = new Set(["SUPERADMIN", "MANAGER"]);

export function canReadRenderJob(reader: Reader, job: Job): boolean {
  if (job.companyId !== reader.companyId) return false;
  if (job.requestedById && job.requestedById === reader.id) return true;
  return MANAGER_ROLES.has(reader.role);
}
