import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient | PrismaClient;

export async function recordTransaction(
  tx: TxClient,
  userId: string,
  type: string,
  description: string,
  amount: number,
  newBalance: number
) {
  await tx.transaction.create({
    data: {
      userId,
      type,
      description,
      amount,
      runningBalance: newBalance,
    },
  });
}