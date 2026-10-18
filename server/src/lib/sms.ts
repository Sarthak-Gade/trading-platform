import fs from 'fs';
import path from 'path';

// Real SMS goes through Twilio when these are set in server/.env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_FROM (your Twilio number)
//   or TWILIO_MESSAGING_SERVICE_SID. Without them the SMS is only printed in the server terminal.
export const smsIsReal = (): boolean =>
  !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );

// `to` must include the country code, like +919876543210. Throws if Twilio refuses the message.
export async function sendSms(to: string, body: string): Promise<void> {
  if (!smsIsReal()) {
    console.log(`\n📱 SMS to ${to}\n   ${body}\n`);
    try {
      const dir = path.join(__dirname, '..', '..', 'logs');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'sms.log'), `[${new Date().toISOString()}] To: ${to}\n${body}\n${'-'.repeat(60)}\n`, 'utf8');
    } catch {
      // logging only
    }
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;

  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    form.set('From', process.env.TWILIO_FROM as string);
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Twilio rejected the SMS (${res.status}): ${detail?.message ?? 'no details'}`);
  }
}

// `mobile` is the stored 10-digit Indian number
export async function sendOtpSms(mobile: string, code: string, ttlMinutes: number): Promise<void> {
  await sendSms(
    `+91${mobile}`,
    `TradeSim: ${code} is your mobile verification code. Valid for ${ttlMinutes} minutes. Do not share it with anyone.`
  );
}