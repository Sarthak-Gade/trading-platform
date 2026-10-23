-- CreateTable
CREATE TABLE "public"."ContractNoteEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractNoteEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractNoteEmail_userId_date_key" ON "public"."ContractNoteEmail"("userId", "date");

-- AddForeignKey
ALTER TABLE "public"."ContractNoteEmail" ADD CONSTRAINT "ContractNoteEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
