/*
  Warnings:

  - A unique constraint covering the columns `[questionId,userId]` on the table `answers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "answers_questionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "answers_questionId_userId_key" ON "answers"("questionId", "userId");
