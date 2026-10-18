// Input validation for every route that accepts a request body.
// Each validator returns { ok: true, value } with cleaned data, or { ok: false, error } with a
// message that is safe to show to the user.

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

export const MAX_AMOUNT = 10_000_000; // ₹1 crore per deposit or withdrawal
const MAX_PRICE = 10_000_000;

export const GENDERS = ['Male', 'Female', 'Other'];
export const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];
export const INCOME_RANGES = ['0-5L', '5-10L', '10-25L', '25L+'];

function body(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

// A trimmed string of the right length with no control characters, or null
function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t.length < min || t.length > max || CONTROL_CHARS_RE.test(t)) return null;
  return t;
}

function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(Math.round(n * 100) / 100 - n) < 1e-9;
}

// ---------- Auth ----------

// Returns what is wrong with a password, or null if it is acceptable
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required';
  // bcrypt only reads the first 72 bytes, so longer passwords would be silently cut short
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must be 8 to 72 characters';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  mobNumber: string;
}

export function validateSignup(input: unknown): Result<SignupInput> {
  const b = body(input);

  const fullName = text(b.fullName, 2, 80);
  if (!fullName) return fail('Full name must be 2 to 80 characters');

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail('Enter a valid email address');

  // Accept 9876543210, +91 98765 43210 and 09876543210; store just the 10 digits
  const digits = typeof b.mobNumber === 'string' ? b.mobNumber.replace(/[\s-]/g, '') : '';
  const mobMatch = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  if (!mobMatch || !mobMatch[1]) return fail('Enter a valid 10-digit Indian mobile number');

  const password = b.password;
  const problem = passwordProblem(password);
  if (problem || typeof password !== 'string') return fail(problem ?? 'Password is required');

  return { ok: true, value: { email, password, fullName, mobNumber: mobMatch[1] } };
}

export function validateLogin(input: unknown): Result<{ email: string; password: string }> {
  const b = body(input);
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = b.password;
  if (!email || email.length > 254 || typeof password !== 'string' || password.length === 0) {
    return fail('Email and password are required');
  }
  return { ok: true, value: { email, password } };
}

// ---------- Money ----------

export function validateAmount(input: unknown, label: string): Result<number> {
  const amount = body(input).amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return fail(`${label} amount must be a positive number`);
  }
  if (!hasAtMostTwoDecimals(amount)) return fail(`${label} amount can have at most 2 decimal places`);
  if (amount > MAX_AMOUNT) return fail(`${label} amount cannot be more than ₹${MAX_AMOUNT.toLocaleString('en-IN')} at a time`);
  return { ok: true, value: Math.round(amount * 100) / 100 };
}

// ---------- Alerts and watchlists ----------

export function validateAlert(
  input: unknown
): Result<{ instrumentId: string; triggerPrice: number; condition: 'above' | 'below' }> {
  const b = body(input);
  if (typeof b.instrumentId !== 'string' || !b.instrumentId) return fail('instrumentId is required');
  if (b.condition !== 'above' && b.condition !== 'below') return fail('condition must be "above" or "below"');
  const price = b.triggerPrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
    return fail('triggerPrice must be a positive number');
  }
  return { ok: true, value: { instrumentId: b.instrumentId, triggerPrice: price, condition: b.condition } };
}

export function validateWatchlistName(input: unknown): Result<string> {
  const name = text(body(input).name, 1, 40);
  return name ? { ok: true, value: name } : fail('Watchlist name must be 1 to 40 characters');
}

export function validateInstrumentId(input: unknown): Result<string> {
  const id = body(input).instrumentId;
  return typeof id === 'string' && id.length > 0 ? { ok: true, value: id } : fail('instrumentId is required');
}

// ---------- KYC and banks ----------

export interface AccountInput {
  dob: Date;
  pan_no: string;
  gender: string;
  maritalStatus: string;
  occupation: string;
  incomeRange: string;
}

function parseDob(value: unknown, now: Date): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value.slice(0, 10) + 'T00:00:00.000Z');
  if (Number.isNaN(date.getTime())) return null;
  // Rejects dates like 2000-02-31 that JavaScript would roll over to March
  if (date.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;

  const eighteen = new Date(now);
  eighteen.setUTCFullYear(eighteen.getUTCFullYear() - 18);
  const oldest = new Date(now);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - 110);
  return date <= eighteen && date >= oldest ? date : null;
}

export function validateAccountCreate(input: unknown, now: Date = new Date()): Result<AccountInput> {
  const b = body(input);

  const dob = parseDob(b.dob, now);
  if (!dob) return fail('Enter a valid date of birth. You must be at least 18 years old');

  const pan = typeof b.pan_no === 'string' ? b.pan_no.trim().toUpperCase() : '';
  if (!PAN_RE.test(pan)) return fail('Enter a valid PAN, like ABCDE1234F');

  if (typeof b.gender !== 'string' || !GENDERS.includes(b.gender)) {
    return fail(`gender must be one of: ${GENDERS.join(', ')}`);
  }
  if (typeof b.maritalStatus !== 'string' || !MARITAL_STATUSES.includes(b.maritalStatus)) {
    return fail(`maritalStatus must be one of: ${MARITAL_STATUSES.join(', ')}`);
  }
  const occupation = text(b.occupation, 2, 60);
  if (!occupation) return fail('Occupation must be 2 to 60 characters');
  if (typeof b.incomeRange !== 'string' || !INCOME_RANGES.includes(b.incomeRange)) {
    return fail(`incomeRange must be one of: ${INCOME_RANGES.join(', ')}`);
  }

  return {
    ok: true,
    value: { dob, pan_no: pan, gender: b.gender, maritalStatus: b.maritalStatus, occupation, incomeRange: b.incomeRange },
  };
}

// Only these fields can change after KYC is created (PAN and date of birth stay locked)
export function validateAccountPatch(
  input: unknown
): Result<{ gender?: string; maritalStatus?: string; occupation?: string; incomeRange?: string }> {
  const b = body(input);
  const out: { gender?: string; maritalStatus?: string; occupation?: string; incomeRange?: string } = {};

  if (b.gender !== undefined) {
    if (typeof b.gender !== 'string' || !GENDERS.includes(b.gender)) return fail(`gender must be one of: ${GENDERS.join(', ')}`);
    out.gender = b.gender;
  }
  if (b.maritalStatus !== undefined) {
    if (typeof b.maritalStatus !== 'string' || !MARITAL_STATUSES.includes(b.maritalStatus)) {
      return fail(`maritalStatus must be one of: ${MARITAL_STATUSES.join(', ')}`);
    }
    out.maritalStatus = b.maritalStatus;
  }
  if (b.occupation !== undefined) {
    const occupation = text(b.occupation, 2, 60);
    if (!occupation) return fail('Occupation must be 2 to 60 characters');
    out.occupation = occupation;
  }
  if (b.incomeRange !== undefined) {
    if (typeof b.incomeRange !== 'string' || !INCOME_RANGES.includes(b.incomeRange)) {
      return fail(`incomeRange must be one of: ${INCOME_RANGES.join(', ')}`);
    }
    out.incomeRange = b.incomeRange;
  }

  if (Object.keys(out).length === 0) return fail('Nothing to update');
  return { ok: true, value: out };
}

export function validateBank(
  input: unknown
): Result<{ accountNumber: string; ifscCode: string; bankBranch: string }> {
  const b = body(input);

  const accountNumber = typeof b.accountNumber === 'string' ? b.accountNumber.replace(/\s/g, '') : '';
  if (!/^\d{9,18}$/.test(accountNumber)) return fail('Account number must be 9 to 18 digits');

  const ifscCode = typeof b.ifscCode === 'string' ? b.ifscCode.trim().toUpperCase() : '';
  if (!IFSC_RE.test(ifscCode)) return fail('Enter a valid IFSC code, like HDFC0001234');

  const bankBranch = text(b.bankBranch, 2, 80);
  if (!bankBranch) return fail('Branch must be 2 to 80 characters');

  return { ok: true, value: { accountNumber, ifscCode, bankBranch } };
}

// ---------- Email and mobile codes (OTP) ----------

function cleanEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function validateEmailOnly(input: unknown): Result<string> {
  const email = cleanEmail(body(input).email);
  return email ? { ok: true, value: email } : fail('Enter a valid email address');
}

export function validateVerify(input: unknown): Result<{ email: string; code: string }> {
  const b = body(input);
  const email = cleanEmail(b.email);
  if (!email) return fail('Enter a valid email address');
  const code = typeof b.code === 'string' ? b.code.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(code)) return fail('Enter the 6-digit code');
  return { ok: true, value: { email, code } };
}

export function validateReset(input: unknown): Result<{ email: string; code: string; newPassword: string }> {
  const verified = validateVerify(input);
  if (!verified.ok) return verified;
  const newPassword = body(input).newPassword;
  const problem = passwordProblem(newPassword);
  if (problem) return fail(problem);
  return { ok: true, value: { ...verified.value, newPassword: newPassword as string } };
}

export function validateResend(
  input: unknown
): Result<{ email: string; channel: 'email' | 'mobile' | null }> {
  const email = cleanEmail(body(input).email);
  if (!email) return fail('Enter a valid email address');
  const channel = body(input).channel;
  if (channel === undefined) return { ok: true, value: { email, channel: null } };
  if (channel !== 'email' && channel !== 'mobile') return fail('channel must be "email" or "mobile"');
  return { ok: true, value: { email, channel } };
}