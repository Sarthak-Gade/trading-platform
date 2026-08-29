-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Balance" (
    "id" TEXT NOT NULL,
    "availableBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "usedMargin" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "pan_no" TEXT NOT NULL,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "occupation" TEXT,
    "incomeRange" TEXT,
    "uniqueClientCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "lotSize" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "orderPrice" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validity" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Trade" (
    "id" TEXT NOT NULL,
    "pricePerShare" DECIMAL(65,30) NOT NULL,
    "sharesQty" INTEGER NOT NULL,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "brokerage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Position" (
    "id" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "netQty" INTEGER NOT NULL,
    "avgPrice" DECIMAL(65,30) NOT NULL,
    "realizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Holding" (
    "id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "investedValue" DECIMAL(65,30) NOT NULL,
    "currentValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Bank" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "bankBranch" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "userId" TEXT NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Watchlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_key" ON "public"."Balance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_pan_no_key" ON "public"."Account"("pan_no");

-- CreateIndex
CREATE UNIQUE INDEX "Account_uniqueClientCode_key" ON "public"."Account"("uniqueClientCode");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_key" ON "public"."Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "public"."Instrument"("symbol");

-- AddForeignKey
ALTER TABLE "public"."Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "public"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "public"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Trade" ADD CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Position" ADD CONSTRAINT "Position_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "public"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Holding" ADD CONSTRAINT "Holding_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "public"."Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Bank" ADD CONSTRAINT "Bank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
