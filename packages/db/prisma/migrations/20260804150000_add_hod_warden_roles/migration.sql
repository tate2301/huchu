-- HOD and WARDEN were defined as personas with real permission grants but were
-- never values of UserRole, so neither could be assigned to anybody. Results
-- moderation fell to whoever happened to hold SCHOOL_ADMIN, and boarding had no
-- role of its own at all.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'HOD';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WARDEN';
