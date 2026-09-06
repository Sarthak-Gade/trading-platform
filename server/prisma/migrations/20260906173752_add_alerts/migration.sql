-- CreateTable
CREATE TABLE "public"."Alert" (
    "id" TEXT NOT NULL,
    "triggerPrice" DECIMAL(65,30) NOT NULL,
    "condition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Alert" ADD CONSTRAINT "Alert_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "public"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
