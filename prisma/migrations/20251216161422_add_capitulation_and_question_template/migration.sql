-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "capitulation" TEXT,
ADD COLUMN     "templateFilename" TEXT,
ADD COLUMN     "templateMimeType" TEXT,
ADD COLUMN     "templateOriginalName" TEXT,
ADD COLUMN     "templatePath" TEXT,
ADD COLUMN     "templateSize" INTEGER;
