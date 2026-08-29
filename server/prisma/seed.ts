/// <reference types="node" />
import prisma from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'testuser@example.com',
      passwordHash: 'placeholder_hash',
      fullName: 'Test User',
      mobNumber: '9999999999',
      balance: {
        create: {
          availableBalance: 100000,
          usedMargin: 0,
        },
      },
    },
  });

  const reliance = await prisma.instrument.create({
    data: {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      type: 'EQUITY',
      exchange: 'NSE',
      lotSize: 1,
    },
  });

  console.log('Seeded user:', user);
  console.log('Seeded instrument:', reliance);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });