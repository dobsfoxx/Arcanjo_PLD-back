-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "normFilename" TEXT,
ADD COLUMN     "normMimeType" TEXT,
ADD COLUMN     "normOriginalName" TEXT,
ADD COLUMN     "normPath" TEXT,
ADD COLUMN     "normSize" INTEGER;
