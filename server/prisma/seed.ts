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

  await seedAllNSEStocks();
}

async function seedAllNSEStocks() {
  console.log('Fetching full NSE equity list...');

  const res = await fetch('https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept: 'text/csv,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.nseindia.com/',
    },
  });

  if (!res.ok) {
    console.error(`Failed to fetch NSE equity list: HTTP ${res.status}`);
    return;
  }

  const csvText = await res.text();
  const lines = csvText.trim().split('\n').slice(1); // skip header row

  const instrumentsData = lines
    .map((line) => {
      const cols = line.split(',');
      const symbol = cols[0]?.trim();
      const name = cols[1]?.trim();
      if (!symbol || !name) return null;
      return {
        symbol,
        name,
        type: 'EQUITY',
        exchange: 'NSE',
        lotSize: 1,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  console.log(`Parsed ${instrumentsData.length} instruments from CSV, inserting...`);

  const result = await prisma.instrument.createMany({
    data: instrumentsData,
    skipDuplicates: true,
  });

  console.log(`Seeded ${result.count} new NSE instruments (${instrumentsData.length} total found in CSV)`);
}

/*main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });*/

  seedAllNSEStocks()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });