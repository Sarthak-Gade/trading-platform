import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { HttpError, sendError } from '../lib/trading';
import {
  validateSignup, validateLogin, validateEmailOnly, validateVerify, validateReset, validateResend,
} from '../lib/validate';
import { issueOtp, verifyOtp, OTP_TTL_MINUTES } from '../lib/otp';
import { sendOtpEmail, emailIsReal, type OtpPurpose } from '../lib/mailer';
import { sendOtpSms, smsIsReal } from '../lib/sms';
import { loginLimiter, signupLimiter, otpLimiter } from '../middleware/rateLimit';

const router = Router();

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 30;

// Compared against when the email is unknown, so "no such account" takes as long as "wrong password"
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const findByEmail = (email: string) =>
  prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

// ---------- Sending codes ----------

interface Delivery {
  status: 'sent' | 'failed' | 'cooldown' | 'skipped';
  // Only set in development, and only for a channel with no real provider configured
  devCode?: string;
}

interface CodeUser {
  id: string;
  email: string;
  fullName: string;
  mobNumber: string;
  emailVerifiedAt: Date | null;
  mobileVerifiedAt: Date | null;
}

function showDevCode(purpose: OtpPurpose): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return purpose === 'verify_mobile' ? !smsIsReal() : !emailIsReal();
}

// Creates a code and sends it. Never throws: the result says what happened.
async function deliver(user: CodeUser, purpose: OtpPurpose): Promise<Delivery> {
  let code: string;
  try {
    code = await issueOtp(user.id, purpose);
  } catch (error) {
    if (error instanceof HttpError) return { status: 'cooldown' }; // asked again within a minute
    console.error(`Could not create a ${purpose} code:`, error);
    return { status: 'failed' };
  }

  try {
    if (purpose === 'verify_mobile') {
      await sendOtpSms(user.mobNumber, code, OTP_TTL_MINUTES);
    } else {
      await sendOtpEmail(user.email, user.fullName, purpose, code, OTP_TTL_MINUTES);
    }
  } catch (error) {
    console.error(`Could not send the ${purpose} code:`, error);
    // Forget the code so the user can ask again straight away instead of waiting out the cooldown
    await prisma.otpCode.deleteMany({ where: { userId: user.id, purpose } }).catch(() => undefined);
    return { status: 'failed' };
  }

  return { status: 'sent', ...(showDevCode(purpose) ? { devCode: code } : {}) };
}

const SKIPPED: Delivery = { status: 'skipped' };

// Sends a code for each of email and mobile that is not verified yet
async function sendVerificationCodes(user: CodeUser) {
  const email = user.emailVerifiedAt ? SKIPPED : await deliver(user, 'verify_email');
  const mobile = user.mobileVerifiedAt ? SKIPPED : await deliver(user, 'verify_mobile');
  return { email, mobile };
}

// What the verify page needs to know
function verificationPayload(user: CodeUser, sent: { email: Delivery; mobile: Delivery }) {
  return {
    email: user.email,
    maskedMobile: '••••••' + user.mobNumber.slice(-4),
    emailVerified: !!user.emailVerifiedAt,
    mobileVerified: !!user.mobileVerifiedAt,
    delivery: { email: sent.email.status, mobile: sent.mobile.status },
    devCodes: { email: sent.email.devCode, mobile: sent.mobile.devCode },
  };
}

// ---------- Signup ----------

router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateSignup(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { email, password, fullName, mobNumber } = parsed.value;

    if (await findByEmail(email)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    if (await prisma.user.findFirst({ where: { mobNumber } })) {
      return res.status(409).json({ error: 'An account with this mobile number already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        mobNumber,
        balance: { create: { availableBalance: 0, usedMargin: 0 } },
      },
    });

    // The account exists even if a code could not be sent; the user can ask for a new one
    const sent = await sendVerificationCodes(user);

    res.status(201).json({
      id: user.id,
      fullName: user.fullName,
      verificationRequired: true,
      ...verificationPayload(user, sent),
    });
  } catch (error) {
    // Two signups with the same email at the same moment: the database's unique rule catches the second
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Something went wrong during signup' });
  }
});

// ---------- Login with lockout ----------

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateLogin(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { email, password } = parsed.value;

    const user = await findByEmail(email);
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // A locked account is refused before the password is even checked, so guessing during a lock is pointless
    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      const seconds = Math.ceil((user.lockedUntil.getTime() - now) / 1000);
      const minutes = Math.ceil(seconds / 60);
      res.setHeader('Retry-After', String(seconds));
      return res.status(423).json({
        error: `Too many failed attempts. Your account is locked. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: seconds,
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      // A finished lock starts a fresh count
      await prisma.user.updateMany({
        where: { id: user.id, lockedUntil: { lte: new Date() } },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      // The database adds 1 itself, so parallel wrong guesses are all counted
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
      });

      if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
        });
        return res.status(423).json({
          error: `Too many failed attempts. Your account is locked for ${LOCK_MINUTES} minutes. You can also reset your password.`,
          code: 'ACCOUNT_LOCKED',
          retryAfterSeconds: LOCK_MINUTES * 60,
        });
      }

      const left = MAX_FAILED_LOGINS - updated.failedLoginCount;
      return res.status(401).json({
        error:
          left <= 2
            ? `Invalid email or password. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before your account is locked.`
            : 'Invalid email or password',
      });
    }

    // Correct password: clear the counter
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    }

    // Email or mobile not confirmed yet: no token, but send fresh codes (the 1-minute wait still applies)
    if (!user.emailVerifiedAt || !user.mobileVerifiedAt) {
      const sent = await sendVerificationCodes(user);
      return res.status(403).json({
        error: 'Please verify your email and mobile number to continue.',
        code: 'NOT_VERIFIED',
        ...verificationPayload(user, sent),
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET as string, {
      expiresIn: '7d',
    });

    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } });
  } catch (error) {
    sendError(res, error, 'during login');
  }
});

// ---------- Email and mobile verification ----------

async function confirmCode(req: Request, res: Response, purpose: 'verify_email' | 'verify_mobile') {
  try {
    const parsed = validateVerify(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { email, code } = parsed.value;

    const user = await findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Incorrect code' });
    }

    let emailVerified = !!user.emailVerifiedAt;
    let mobileVerified = !!user.mobileVerifiedAt;

    const alreadyDone = purpose === 'verify_email' ? emailVerified : mobileVerified;
    if (!alreadyDone) {
      await verifyOtp(user.id, purpose, code);
      await prisma.user.update({
        where: { id: user.id },
        data: purpose === 'verify_email' ? { emailVerifiedAt: new Date() } : { mobileVerifiedAt: new Date() },
      });
      if (purpose === 'verify_email') emailVerified = true;
      else mobileVerified = true;
    }

    res.json({ verified: true, emailVerified, mobileVerified });
  } catch (error) {
    sendError(res, error, 'verifying the code');
  }
}

router.post('/verify-email', otpLimiter, (req, res) => confirmCode(req, res, 'verify_email'));
router.post('/verify-mobile', otpLimiter, (req, res) => confirmCode(req, res, 'verify_mobile'));

// Same answer whether or not the account exists, so this can't be used to find out who has an account
router.post('/resend-code', otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateResend(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { email, channel } = parsed.value;

    const user = await findByEmail(email);
    const devCodes: { email?: string; mobile?: string } = {};
     if (user) {
      if (channel !== 'mobile' && !user.emailVerifiedAt) {
        const sent = await deliver(user, 'verify_email');
        if (sent.devCode) devCodes.email = sent.devCode;
      }
      if (channel !== 'email' && !user.mobileVerifiedAt) {
        const sent = await deliver(user, 'verify_mobile');
        if (sent.devCode) devCodes.mobile = sent.devCode;
      }
    }

    res.json({ message: 'If this account needs a code, a new one has been sent.', devCodes });
  } catch (error) {
    sendError(res, error, 'sending the code');
  }
});

// ---------- Password reset ----------

router.post('/forgot-password', otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateEmailOnly(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const user = await findByEmail(parsed.value);
    const sent = user ? await deliver(user, 'reset_password') : undefined;

    res.json({
      message: 'If an account exists for this email, a reset code has been sent.',
      ...(sent?.devCode ? { devCode: sent.devCode } : {}),
    });
  } catch (error) {
    sendError(res, error, 'sending the reset code');
  }
});

router.post('/reset-password', otpLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = validateReset(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { email, code, newPassword } = parsed.value;

    const user = await findByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Incorrect code' });
    }

    await verifyOtp(user.id, 'reset_password', code);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // A new password also ends any lock, and receiving the code proves the email is theirs
        failedLoginCount: 0,
        lockedUntil: null,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });

    res.json({ message: 'Password updated. You can log in now.' });
  } catch (error) {
    sendError(res, error, 'resetting the password');
  }
});

export default router;