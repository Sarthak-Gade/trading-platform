-- AlterTable
ALTER TABLE "public"."Account" ADD COLUMN     "kycNote" TEXT,
ADD COLUMN     "kycReviewedAt" TIMESTAMP(3),
ADD COLUMN     "kycStatus" TEXT NOT NULL DEFAULT 'pending';
-- Users who already submitted KYC before this feature stay able to trade
UPDATE "public"."Account" SET "kycStatus" = 'verified';
