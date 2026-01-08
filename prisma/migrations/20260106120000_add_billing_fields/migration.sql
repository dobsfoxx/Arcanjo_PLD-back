-- Add billing/trial fields for Stripe scaffolding.

ALTER TABLE "users"
  ALTER COLUMN "isTrial" SET DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_stripeCustomerId_key'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_stripeCustomerId_key" UNIQUE ("stripeCustomerId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_stripeSubscriptionId_key'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_stripeSubscriptionId_key" UNIQUE ("stripeSubscriptionId");
  END IF;
END $$;
