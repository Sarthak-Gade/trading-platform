/// <reference types="node" />
import bcrypt from 'bcrypt';
import prisma from '../src/lib/prisma';

// Test accounts for trying TradeSim without signing up each time. Safe to run again: it updates the
// accounts by email and never creates duplicates. Run it with:
//   npx ts-node --transpile-only prisma/seed-users.ts
// Never run this against a real deployment, the passwords below are public.

const ADMIN_PASSWORD = 'Admin@12345';
const TRADER_PASSWORD = 'Trader@12345';

interface SeedUser {
  email: string;
  fullName: string;
  mobNumber: string;
  password: string;
  role: 'ADMIN' | 'USER';
  balance: number;
  // KYC details. kycStatus 'verified' means the user can trade straight away.
  pan: string;
  dob: string;
  kycStatus: 'verified' | 'pending';
}

const USERS: SeedUser[] = [
  { email: 'admin@tradesim.test', fullName: 'Admin User', mobNumber: '9000000001', password: ADMIN_PASSWORD, role: 'ADMIN', balance: 1000000, pan: 'ADMIN1001A', dob: '1985-01-15', kycStatus: 'verified' },
  { email: 'trader1@tradesim.test', fullName: 'Aarav Sharma', mobNumber: '9000000011', password: TRADER_PASSWORD, role: 'USER', balance: 500000, pan: 'ABCPS1001A', dob: '1992-03-21', kycStatus: 'verified' },
  { email: 'trader2@tradesim.test', fullName: 'Diya Patel', mobNumber: '9000000012', password: TRADER_PASSWORD, role: 'USER', balance: 250000, pan: 'ABCPS1002B', dob: '1994-07-09', kycStatus: 'verified' },
  { email: 'trader3@tradesim.test', fullName: 'Rohan Mehta', mobNumber: '9000000013', password: TRADER_PASSWORD, role: 'USER', balance: 100000, pan: 'ABCPS1003C', dob: '1990-11-30', kycStatus: 'verified' },
  { email: 'trader4@tradesim.test', fullName: 'Isha Verma', mobNumber: '9000000014', password: TRADER_PASSWORD, role: 'USER', balance: 750000, pan: 'ABCPS1004D', dob: '1988-05-04', kycStatus: 'verified' },
  { email: 'trader5@tradesim.test', fullName: 'Kabir Singh', mobNumber: '9000000015', password: TRADER_PASSWORD, role: 'USER', balance: 50000, pan: 'ABCPS1005E', dob: '1996-09-17', kycStatus: 'verified' },
  // Email and mobile verified, but KYC still waiting: use it to try the KYC review page
  { email: 'kyc.pending@tradesim.test', fullName: 'Meera Nair', mobNumber: '9000000021', password: TRADER_PASSWORD, role: 'USER', balance: 100000, pan: 'ABCPS2001F', dob: '1993-02-12', kycStatus: 'pending' },
];

async function main() {
  const now = new Date();

  for (const [index, u] of USERS.entries()) {
    const passwordHash = await bcrypt.hash(u.password, 10);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        emailVerifiedAt: now,
        mobileVerifiedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        mobNumber: u.mobNumber,
        role: u.role,
        emailVerifiedAt: now,
        mobileVerifiedAt: now,
      },
    });

    // The wallet is only created, never reset, so re-running does not wipe a tester's trades
    await prisma.balance.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, availableBalance: u.balance, usedMargin: 0 },
    });

    const kyc = {
      dob: new Date(`${u.dob}T00:00:00.000Z`),
      pan_no: u.pan,
      gender: 'Male',
      maritalStatus: 'Single',
      occupation: 'Software engineer',
      incomeRange: '10-25L',
      kycStatus: u.kycStatus,
      kycNote: null,
      kycReviewedAt: u.kycStatus === 'verified' ? now : null,
    };
    await prisma.account.upsert({
      where: { userId: user.id },
      update: { kycStatus: kyc.kycStatus, kycNote: null, kycReviewedAt: kyc.kycReviewedAt },
      create: { userId: user.id, uniqueClientCode: `UCCSEED${String(index + 1).padStart(4, '0')}`, ...kyc },
    });

    console.log(`${u.role === 'ADMIN' ? 'admin ' : 'user  '} ${u.email.padEnd(28)} KYC ${u.kycStatus}`);
  }

  console.log('\nLog in with:');
  console.log(`  admin    admin@tradesim.test        ${ADMIN_PASSWORD}`);
  console.log(`  traders  trader1..5@tradesim.test   ${TRADER_PASSWORD}`);
  console.log(`  pending  kyc.pending@tradesim.test  ${TRADER_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());