-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'SENT_TO_USER', 'IN_PROGRESS', 'SENT_FOR_REVIEW', 'APPROVED', 'RETURNED');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN "status" "FormStatus" DEFAULT 'DRAFT';
ALTER TABLE "reports" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "reports" ADD COLUMN "assignedToEmail" TEXT;
ALTER TABLE "reports" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "reports" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "reports" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- AddForeignKey (opcional, permite atribuir a usuários cadastrados)
ALTER TABLE "reports" ADD CONSTRAINT "reports_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
