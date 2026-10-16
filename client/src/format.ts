// Display helpers shared by every page

export function inr(value: number, digits = 2): string {
  return (
    '₹' +
    value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
}

export function signedInr(value: number): string {
  return (value >= 0 ? '+' : '−') + inr(Math.abs(value));
}

export function signedPct(value: number): string {
  return (value >= 0 ? '+' : '−') + Math.abs(value).toFixed(2) + '%';
}

// CSS class for green / red / neutral numbers
export function tone(value: number | null | undefined): 'up' | 'down' | '' {
  if (value === null || value === undefined || value === 0) return '';
  return value > 0 ? 'up' : 'down';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'TS';
  const first = parts[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1] ?? '') : (first.slice(1, 2) ?? '');
  return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type MarketPhase = 'OPEN' | 'PRE_OPEN' | 'CLOSED';

// NSE equity hours in India time: pre-open 9:00-9:15, regular session 9:15-15:30, Monday to Friday.
// Exchange holidays are not known here, so on a holiday this can say "Open" when it is not.
export function getMarketPhase(now: Date = new Date()): MarketPhase {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minutes = hour * 60 + Number(get('minute'));

  if (weekday === 'Sat' || weekday === 'Sun') return 'CLOSED';
  if (minutes >= 9 * 60 && minutes < 9 * 60 + 15) return 'PRE_OPEN';
  if (minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30) return 'OPEN';
  return 'CLOSED';
}
