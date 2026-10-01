import YahooFinance from 'yahoo-finance2';
import { HttpError } from './trading';

const yahooFinance = new YahooFinance();

// Short cache so many users / the 5s UI refresh don't hammer Yahoo (it rate-limits).
const CACHE_TTL_MS = 5000;

export interface MarketQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketState: string | null;
  fetchedAt: number;
}

const cache = new Map<string, { at: number; quote: MarketQuote }>();
const inflight = new Map<string, Promise<MarketQuote>>();

function toYahooSymbol(symbol: string, exchange: string): string {
  return `${symbol}${exchange === 'BSE' ? '.BO' : '.NS'}`;
}

export async function getQuote(symbol: string, exchange: string): Promise<MarketQuote> {
  const yahooSymbol = toYahooSymbol(symbol, exchange);

  const cached = cache.get(yahooSymbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.quote;
  }

  // If a request for the same symbol is already running, share it instead of sending another
  const pending = inflight.get(yahooSymbol);
  if (pending) return pending;

  const request = (async () => {
    try {
      const q = await yahooFinance.quote(yahooSymbol);
      const price = q?.regularMarketPrice;

      if (typeof price !== 'number' || !(price > 0)) {
        throw new HttpError(503, 'Live price is not available for this instrument');
      }

      const quote: MarketQuote = {
        symbol,
        price,
        previousClose: q.regularMarketPreviousClose ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        dayHigh: q.regularMarketDayHigh ?? null,
        dayLow: q.regularMarketDayLow ?? null,
        marketState: q.marketState ?? null,
        fetchedAt: Date.now(),
      };

      cache.set(yahooSymbol, { at: Date.now(), quote });
      return quote;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error(`Quote fetch failed for ${yahooSymbol}:`, error);
      throw new HttpError(503, 'Live price is temporarily unavailable. Please try again.');
    } finally {
      inflight.delete(yahooSymbol);
    }
  })();

  inflight.set(yahooSymbol, request);
  return request;
}