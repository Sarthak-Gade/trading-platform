import crypto from 'crypto';
import prisma from './prisma';
import { HttpError } from './trading';
import type { OtpPurpose } from './mailer';

export const OTP_TTL_MINUTES = 10;
const OTP_TTL_MS = OTP_TTL_MINUTES * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

// Only a keyed hash of the code is stored, so a leaked database does not reveal live codes
function hashCode(userId: string, purpose: OtpPurpose, code: string): string {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET as string)
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Creates a fresh 6-digit code, replacing any earlier one for the same purpose.
// Throws 429 if a code was sent less than a minute ago.
export async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const existing = await prisma.otpCode.findUnique({ where: { userId_purpose: { userId, purpose } } });
  if (existing) {
    const waitMs = existing.sentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
    if (waitMs > 0) {
      throw new HttpError(429, `Please wait ${Math.ceil(waitMs / 1000)} seconds before asking for another code`);
    }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const data = {
    codeHash: hashCode(userId, purpose, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    sentAt: new Date(),
  };

  await prisma.otpCode.upsert({
    where: { userId_purpose: { userId, purpose } },
    create: { userId, purpose, ...data },
    update: data,
  });

  return code;
}

// Checks a submitted code. Returns normally on success (the code is then used up);
// throws HttpError otherwise. Five wrong guesses burn the code.
export async function verifyOtp(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
  const record = await prisma.otpCode.findUnique({ where: { userId_purpose: { userId, purpose } } });
  if (!record) {
    throw new HttpError(400, 'No active code. Please request a new one.');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.otpCode.deleteMany({ where: { id: record.id } });
    throw new HttpError(400, 'This code has expired. Please request a new one.');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.deleteMany({ where: { id: record.id } });
    throw new HttpError(429, 'Too many wrong attempts. Please request a new code.');
  }

  if (!safeEqual(record.codeHash, hashCode(userId, purpose, code))) {
    // The database adds 1 itself, so parallel guesses are all counted
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - updated.attempts;
    if (left <= 0) {
      await prisma.otpCode.deleteMany({ where: { id: record.id } });
      throw new HttpError(429, 'Too many wrong attempts. Please request a new code.');
    }
    throw new HttpError(400, `Incorrect code. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`);
  }

  // Delete returns how many rows it removed: if a parallel request already used this code, we get 0
  const used = await prisma.otpCode.deleteMany({ where: { id: record.id } });
  if (used.count === 0) {
    throw new HttpError(400, 'This code was already used. Please request a new one.');
  }
}