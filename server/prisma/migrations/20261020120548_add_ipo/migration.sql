-- CreateTable
CREATE TABLE "public"."Ipo" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "priceMin" DECIMAL(12,2) NOT NULL,
    "priceMax" DECIMAL(12,2) NOT NULL,
    "lotSize" INTEGER NOT NULL,
    "openDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "issuePrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IpoApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "lots" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "bidPrice" DECIMAL(12,2) NOT NULL,
    "fundsBlocked" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpoApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpoApplication_userId_ipoId_key" ON "public"."IpoApplication"("userId", "ipoId");

-- AddForeignKey
ALTER TABLE "public"."Ipo" ADD CONSTRAINT "Ipo_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "public"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IpoApplication" ADD CONSTRAINT "IpoApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IpoApplication" ADD CONSTRAINT "IpoApplication_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "public"."Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
