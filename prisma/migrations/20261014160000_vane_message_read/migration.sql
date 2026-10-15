-- What Vane read to answer each chat turn, for "What I read" under its answer. A person's conversation:
-- neither reader role reads VaneMessage, so no grant.
-- AlterTable
ALTER TABLE "VaneMessage" ADD COLUMN     "readFrom" JSONB NOT NULL DEFAULT '[]';

