-- CreateEnum
CREATE TYPE "PldCriticidade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "PldTesteStatus" AS ENUM ('SIM', 'NAO', 'NAO_PLANO');

-- CreateTable
CREATE TABLE "pld_sections" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "customLabel" TEXT,
    "hasNorma" BOOLEAN NOT NULL DEFAULT false,
    "normaReferencia" TEXT,
    "descricao" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pld_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pld_questions" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "texto" TEXT NOT NULL,
    "aplicavel" BOOLEAN NOT NULL DEFAULT true,
    "templateRef" TEXT,
    "capitulacao" TEXT,
    "criticidade" "PldCriticidade" NOT NULL DEFAULT 'MEDIA',
    "resposta" TEXT,
    "respostaTexto" TEXT,
    "deficienciaTexto" TEXT,
    "recomendacaoTexto" TEXT,
    "testStatus" "PldTesteStatus",
    "testDescription" TEXT,
    "actionOrigem" TEXT,
    "actionResponsavel" TEXT,
    "actionDescricao" TEXT,
    "actionDataApontamento" TIMESTAMP(3),
    "actionPrazoOriginal" TIMESTAMP(3),
    "actionPrazoAtual" TIMESTAMP(3),
    "actionComentarios" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pld_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pld_attachments" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT,
    "questionId" TEXT,
    "category" TEXT NOT NULL,
    "referenceText" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pld_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pld_sections" ADD CONSTRAINT "pld_sections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pld_questions" ADD CONSTRAINT "pld_questions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "pld_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pld_attachments" ADD CONSTRAINT "pld_attachments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "pld_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pld_attachments" ADD CONSTRAINT "pld_attachments_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "pld_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
