/// <reference types="node" />
import prisma from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'testuser@example.com',
      passwordHash: 'placeholder_hash', // we'll add real hashing in the Auth phase
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

  console.log('Seeded user:', user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });