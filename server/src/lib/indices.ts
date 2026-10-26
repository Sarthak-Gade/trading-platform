import YahooFinance from 'yahoo-finance2';
import prisma from './prisma';
import { HttpError } from './trading';
import { cached } from './cache';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface IndexDef {
  key: string;
  name: string;
  yahoo: string;
  csv: string | null; // NSE constituent list file, null when NSE does not publish one
}

export const INDEX_DEFS: IndexDef[] = [
  { key: 'NIFTY50', name: 'NIFTY 50', yahoo: '^NSEI', csv: 'ind_nifty50list' },
  { key: 'SENSEX', name: 'SENSEX', yahoo: '^BSESN', csv: null },
  { key: 'BANKNIFTY', name: 'NIFTY BANK', yahoo: '^NSEBANK', csv: 'ind_niftybanklist' },
  { key: 'NIFTYIT', name: 'NIFTY IT', yahoo: '^CNXIT', csv: 'ind_niftyitlist' },
  { key: 'NIFTYPHARMA', name: 'NIFTY PHARMA', yahoo: '^CNXPHARMA', csv: 'ind_niftypharmalist' },
  { key: 'NIFTYNEXT50', name: 'NIFTY NEXT 50', yahoo: '^NSMIDCP', csv: 'ind_niftynext50list' },
];

export function findIndexDef(rawKey: string): IndexDef | undefined {
  return INDEX_DEFS.find((d) => d.key === rawKey.toUpperCase());
}

export interface IndexQuote {
  key: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketState: string | null;
}

// One Yahoo request for all indices, cached for 15 seconds
export function getIndexQuotes() {
  return cached('indexQuotes', 'all', 15_000, async (): Promise<IndexQuote[]> => {
    const raw = await yf.quote(INDEX_DEFS.map((d) => d.yahoo));
    const list = Array.isArray(raw) ? raw : [raw];
    const bySymbol = new Map(list.map((q) => [q.symbol, q]));

    return INDEX_DEFS.map((d) => {
      const q = bySymbol.get(d.yahoo);
      return {
        key: d.key,
        name: d.name,
        price: q?.regularMarketPrice ?? null,
        change: q?.regularMarketChange ?? null,
        changePercent: q?.regularMarketChangePercent ?? null,
        prevClose: q?.regularMarketPreviousClose ?? null,
        dayHigh: q?.regularMarketDayHigh ?? null,
        dayLow: q?.regularMarketDayLow ?? null,
        marketState: q?.marketState ?? null,
      };
    });
  });
}

// ---------- Constituents ----------

interface ListedStock {
  symbol: string;
  name: string;
  industry: string;
}

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'text/csv,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
};

// Splits one CSV line, respecting double-quoted fields
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function fetchIndexList(file: string): Promise<ListedStock[]> {
  const res = await fetch(`https://nsearchives.nseindia.com/content/indices/${file}.csv`, {
    headers: NSE_HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`NSE index list returned HTTP ${res.status}`);

  const lines = (await res.text()).split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parseCsvLine(lines[0] ?? '');
  const iSymbol = header.indexOf('Symbol');
  const iName = header.indexOf('Company Name');
  const iIndustry = header.indexOf('Industry');
  if (iSymbol < 0 || iName < 0) throw new Error('Unexpected NSE index list format');

  const stocks: ListedStock[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const symbol = cols[iSymbol];
    if (!symbol) continue;
    stocks.push({ symbol, name: cols[iName] ?? symbol, industry: iIndustry >= 0 ? (cols[iIndustry] ?? '') : '' });
  }
  return stocks;
}

interface PriceInfo {
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export async function getIndexConstituents(rawKey: string) {
  const def = INDEX_DEFS.find((d) => d.key === rawKey.toUpperCase());
  if (!def) throw new HttpError(404, 'Unknown index');

  if (!def.csv) {
    return { key: def.key, name: def.name, members: [], stale: false, note: 'NSE does not publish a member list for this index.' };
  }
  const csv = def.csv;

  // Member lists change rarely, so they are cached for 12 hours
  const { value: list } = await cached('indexList', def.key, 12 * 3600_000, () => fetchIndexList(csv));

  const instruments = await prisma.instrument.findMany({ where: { symbol: { in: list.map((s) => s.symbol) } } });
  const instrumentBySymbol = new Map(instruments.map((i) => [i.symbol, i]));

  // One Yahoo request for every member, cached for 15 seconds
  const { value: prices, stale } = await cached('indexPrices', def.key, 15_000, async () => {
    const raw = await yf.quote(list.map((s) => `${s.symbol}.NS`));
    const quotes = Array.isArray(raw) ? raw : [raw];
    const map: Record<string, PriceInfo> = {};
    for (const q of quotes) {
      map[q.symbol.replace(/\.NS$/, '')] = {
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
      };
    }
    return map;
  });

  const members = list.map((s) => {
    const p = prices[s.symbol];
    return {
      instrumentId: instrumentBySymbol.get(s.symbol)?.id ?? null,
      symbol: s.symbol,
      name: s.name,
      industry: s.industry,
      price: p?.price ?? null,
      change: p?.change ?? null,
      changePercent: p?.changePercent ?? null,
    };
  });

  return { key: def.key, name: def.name, members, stale };
}