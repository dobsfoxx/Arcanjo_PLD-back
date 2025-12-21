-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "correctiveActionPlan" TEXT,
ADD COLUMN     "testDescription" TEXT,
ADD COLUMN     "testOption" TEXT;

-- AlterTable
ALTER TABLE "evidences" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'GENERAL';
