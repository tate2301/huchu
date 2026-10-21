-- Teams M1: the two products sold under their own names beside Corelith and Flare.
--   TENDER  retail and the till
--   PABASA  jobs, quotes and clients for a trade business
-- FLARE stays: existing Flare workspaces keep their value.
ALTER TYPE "WorkspaceProduct" ADD VALUE IF NOT EXISTS 'TENDER';
ALTER TYPE "WorkspaceProduct" ADD VALUE IF NOT EXISTS 'PABASA';
