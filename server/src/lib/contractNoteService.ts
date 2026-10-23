import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { sendEmail } from './mailer';
import { buildContractNote, contractNoteNumber } from './contractNote';
import type { ContractNoteData } from './contractNote';

const CHECK_EVERY_MS = 5 * 60_000;
const MAX_FAILURES = 3;

// ---------- Indian-time days ----------
// A trading "day" is an Indian-time day, so a trade at 9:20 IST is never filed under the previous UTC date.
export function istDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function istDayRange(date: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00+05:30`);
  // Rejects impossible dates such as 2026-02-31
  if (Number.isNaN(start.getTime()) || istDateString(start) !== date) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function istMinutesOfDay(d: Date): number {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(d)
    .split(':')
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// "16:00" -> 960. Falls back to 16:00 (the market closes at 15:30) if the setting is missing or invalid.
function sendMinutes(): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(process.env.CONTRACT_NOTE_EMAIL_TIME ?? '16:00');
  if (!match) return 16 * 60;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : 16 * 60;
}

// ---------- Building one note ----------
// Everything the PDF needs for one user and one day, or null when the user has no trades that day
export async function loadContractNoteData(userId: string, date: string): Promise<ContractNoteData | null> {
  const range = istDayRange(date);
  if (!range) return null;

  const [user, trades, before, upTo] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { account: true } }),
    prisma.trade.findMany({
      where: { userId, executedAt: { gte: range.start, lt: range.end } },
      include: { instrument: true, order: true },
      orderBy: { executedAt: 'asc' },
    }),
    // Wallet balance after the last ledger entry before the day, and after the last entry of the day
    prisma.transaction.findFirst({ where: { userId, createdAt: { lt: range.start } }, orderBy: { createdAt: 'desc' } }),
    prisma.transaction.findFirst({ where: { userId, createdAt: { lt: range.end } }, orderBy: { createdAt: 'desc' } }),
  ]);

  if (!user || trades.length === 0) return null;

  return {
    date,
    client: {
      name: user.fullName,
      email: user.email,
      mobile: user.mobNumber,
      clientCode: user.account?.uniqueClientCode ?? 'NA',
      pan: user.account?.pan_no ?? '-',
    },
    trades: trades.map((t) => ({
      id: t.id,
      executedAt: t.executedAt,
      symbol: t.instrument.symbol,
      side: t.order.type === 'sell' ? ('sell' as const) : ('buy' as const),
      productType: t.order.productType,
      qty: t.sharesQty,
      price: Number(t.pricePerShare),
      value: Number(t.totalPrice),
      brokerage: Number(t.brokerage),
      stt: Number(t.stt),
      exchangeCharges: Number(t.exchangeCharges),
      sebiCharges: Number(t.sebiCharges),
      gst: Number(t.gst),
      stampDuty: Number(t.stampDuty),
    })),
    openingBalance: before ? Number(before.runningBalance) : null,
    closingBalance: upTo ? Number(upTo.runningBalance) : null,
  };
}

// The whole PDF in memory, for attaching to an email
export function contractNotePdfBuffer(data: ContractNoteData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = buildContractNote(data);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ---------- Emailing the notes ----------
export interface SendSummary {
  date: string;
  traders: number;
  sent: number;
  skipped: number; // already emailed, or no verified email
  failed: number;
}

// Failures counted per user and day, so one bad address is not retried every five minutes forever
const failures = new Map<string, number>();

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// Emails the note for one day to every user who traded that day and has not been sent it yet.
// With resend: true, earlier deliveries for the day are forgotten first (used for testing).
export async function sendContractNotesForDate(date: string, opts: { resend?: boolean } = {}): Promise<SendSummary> {
  const range = istDayRange(date);
  if (!range) throw new Error(`Invalid date: ${date}`);

  const summary: SendSummary = { date, traders: 0, sent: 0, skipped: 0, failed: 0 };

  const traded = await prisma.trade.findMany({
    where: { executedAt: { gte: range.start, lt: range.end } },
    distinct: ['userId'],
    select: { userId: true },
  });
  const userIds = traded.map((t) => t.userId);
  summary.traders = userIds.length;
  if (userIds.length === 0) return summary;

  if (opts.resend) {
    await prisma.contractNoteEmail.deleteMany({ where: { date, userId: { in: userIds } } });
    for (const id of userIds) failures.delete(`${id}:${date}`);
  }

  const delivered = await prisma.contractNoteEmail.findMany({
    where: { date, userId: { in: userIds } },
    select: { userId: true },
  });
  const deliveredIds = new Set(delivered.map((d) => d.userId));
  summary.skipped += deliveredIds.size;

  for (const userId of userIds) {
    if (deliveredIds.has(userId)) continue;

    const key = `${userId}:${date}`;
    if ((failures.get(key) ?? 0) >= MAX_FAILURES) {
      summary.failed += 1;
      continue;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, emailVerifiedAt: true },
    });
    // Only an address the user proved they own gets a statement
    if (!user || !user.emailVerifiedAt) {
      summary.skipped += 1;
      continue;
    }

    // Claim this user and day first, so two runs can never email the same note twice
    try {
      await prisma.contractNoteEmail.create({ data: { userId, date } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        summary.skipped += 1;
        continue;
      }
      throw error;
    }

    try {
      const data = await loadContractNoteData(userId, date);
      if (!data) throw new Error('No trades found while building the note');
      const pdf = await contractNotePdfBuffer(data);

      const buy = data.trades.filter((t) => t.side === 'buy').length;
      const sell = data.trades.length - buy;
      const number = contractNoteNumber(data.client.clientCode, date);

      await sendEmail(
        user.email,
        `Your TradeSim contract note for ${date}`,
        `Hi ${user.fullName},\n\n` +
          `Your contract note for ${date} is attached as a PDF.\n` +
          `You made ${data.trades.length} trade${data.trades.length === 1 ? '' : 's'} today (${buy} buy, ${sell} sell).\n\n` +
          `Note number: ${number}\n\n` +
          `This is a statement of simulated trades made with virtual money. ` +
          `You can also download any day's note from Contract notes inside TradeSim.`,
        [{ filename: `${number}.pdf`, content: pdf, contentType: 'application/pdf' }]
      );
      summary.sent += 1;
      failures.delete(key);
    } catch (error) {
      // Release the claim so the next run can try again, up to MAX_FAILURES times
      await prisma.contractNoteEmail.deleteMany({ where: { userId, date } });
      failures.set(key, (failures.get(key) ?? 0) + 1);
      summary.failed += 1;
      console.error(`[contract-notes] could not email ${userId} for ${date}:`, error instanceof Error ? error.message : error);
    }
  }

  return summary;
}

// ---------- The end-of-day schedule ----------
let running = false;

async function tick() {
  if (running) return; // the last run is still going
  running = true;
  try {
    const now = new Date();
    // Yesterday first: catches up on notes missed because the server was off at send time
    const yesterday = istDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const results = [await sendContractNotesForDate(yesterday)];
    if (istMinutesOfDay(now) >= sendMinutes()) {
      results.push(await sendContractNotesForDate(istDateString(now)));
    }
    for (const r of results) {
      if (r.sent > 0 || r.failed > 0) {
        console.log(`[contract-notes] ${r.date}: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed (${r.traders} traders)`);
      }
    }
  } catch (error) {
    console.error('[contract-notes] run failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export function startContractNoteMailer() {
  if (process.env.CONTRACT_NOTE_EMAILS === 'false') {
    console.log('[contract-notes] daily emails are turned off (CONTRACT_NOTE_EMAILS=false)');
    return;
  }
  setInterval(() => void tick(), CHECK_EVERY_MS);
  setTimeout(() => void tick(), 30_000); // shortly after start, in case a send time was missed
  const m = sendMinutes();
  console.log(
    `[contract-notes] emailing each trader's note daily from ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} IST`
  );
}