import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type OtpPurpose = 'verify_email' | 'verify_mobile' | 'reset_password';

// Real email is used when SMTP_USER and SMTP_PASS are set in server/.env (for Gmail, SMTP_PASS is an
// App Password). Otherwise the email is only printed in the server terminal and logged to
// server/logs/emails.log, which is handy during development.
export const emailIsReal = (): boolean => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transport;
}

function logToFile(entry: string) {
  try {
    const dir = path.join(__dirname, '..', '..', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'emails.log'), entry, 'utf8');
  } catch {
    // The log file is a convenience; a write problem must never break signup or login
  }
}

// Throws if the email could not be sent, so the caller can tell the user
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (emailIsReal()) {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || `TradeSim <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
    return;
  }

  console.log(`\n📧 Email to ${to}\n   ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
  logToFile(`[${new Date().toISOString()}] To: ${to}\nSubject: ${subject}\n${text}\n${'-'.repeat(60)}\n`);
}

export async function sendOtpEmail(
  to: string,
  name: string,
  purpose: OtpPurpose,
  code: string,
  ttlMinutes: number
) {
  const subject =
    purpose === 'reset_password' ? 'Your TradeSim password reset code' : 'Verify your TradeSim email';
  const action = purpose === 'reset_password' ? 'reset your password' : 'verify your email address';
  const text =
    `Hi ${name},\n\nYour code to ${action} is: ${code}\n\n` +
    `It is valid for ${ttlMinutes} minutes. Never share it with anyone. ` +
    `If you did not ask for this, you can ignore this email.`;
  await sendEmail(to, subject, text);
}