-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "note" TEXT,
ADD COLUMN     "triggerPrice" DECIMAL(65,30),
ADD COLUMN     "triggeredAt" TIMESTAMP(3);
