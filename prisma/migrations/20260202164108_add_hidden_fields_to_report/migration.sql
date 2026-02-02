-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "hiddenForAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hiddenForUser" BOOLEAN NOT NULL DEFAULT false;
