import { Server } from 'socket.io';

const NSE_BASE = 'https://www.nseindia.com';
const POLL_INTERVAL_MS = 15000; // 15 seconds — conservative, to avoid tripping anti-bot limits

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
};

let cookieHeader = '';

async function refreshSession() {
  const res = await fetch(`${NSE_BASE}/`, { headers: BROWSER_HEADERS });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ');
}

async function fetchQuote(symbol: string) {
  const res = await fetch(`${NSE_BASE}/api/quote-equity?symbol=${symbol}`, {
    headers: { ...BROWSER_HEADERS, Cookie: cookieHeader },
  });

  console.log('NSE response status:', res.status);
  const text = await res.text();
  console.log('NSE response snippet:', text.slice(0, 200));

  if (res.status === 401 || res.status === 403) {
    await refreshSession();
    const retryRes = await fetch(`${NSE_BASE}/api/quote-equity?symbol=${symbol}`, {
      headers: { ...BROWSER_HEADERS, Cookie: cookieHeader },
    });
    return retryRes.json();
  }

  return JSON.parse(text);
}

export function startNSEPolling(io: Server, symbols: string[]) {
  const poll = async () => {
    for (const symbol of symbols) {
      try {
        const data = await fetchQuote(symbol);
        const price = data?.priceInfo?.lastPrice;

        if (typeof price === 'number') {
          io.emit('priceUpdate', [
            {
              s: symbol,
              p: price,
              t: Date.now(),
              v: data?.priceInfo?.totalTradedVolume ?? 0,
            },
          ]);
        }
      } catch (error) {
        console.error(`Error fetching NSE quote for ${symbol}:`, error);
      }
    }
  };

  refreshSession().then(() => {
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
    console.log(`Started NSE India polling for: ${symbols.join(', ')}`);
  });
}