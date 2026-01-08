-- Add new enum value for builder form completion
ALTER TYPE "FormStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
