import YahooFinance from 'yahoo-finance2';
import { cached } from './cache';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// source = Yahoo interval, days = how far back to ask, bucket = how many source candles make one
export const TIMEFRAMES = {
  '1m': { source: '1m', days: 5, bucket: 1, ttlMs: 20_000 },
  '3m': { source: '1m', days: 5, bucket: 3, ttlMs: 20_000 },
  '5m': { source: '5m', days: 15, bucket: 1, ttlMs: 30_000 },
  '15m': { source: '15m', days: 30, bucket: 1, ttlMs: 30_000 },
  '30m': { source: '30m', days: 45, bucket: 1, ttlMs: 60_000 },
  '1h': { source: '1h', days: 120, bucket: 1, ttlMs: 60_000 },
  '1D': { source: '1d', days: 365, bucket: 1, ttlMs: 300_000 },
  '1W': { source: '1wk', days: 1095, bucket: 1, ttlMs: 300_000 },
} as const;

export type Timeframe = keyof typeof TIMEFRAMES;

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && value in TIMEFRAMES;
}

export interface Candle {
  time: number; // unix seconds, UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Combine consecutive candles into larger ones, e.g. three 1m candles into one 3m candle
function regroup(candles: Candle[], seconds: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const slot = Math.floor(c.time / seconds) * seconds;
    const last = out[out.length - 1];
    if (last && last.time === slot) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      out.push({ ...c, time: slot });
    }
  }
  return out;
}

export function getCandles(yahooSymbol: string, timeframe: Timeframe) {
  const tf = TIMEFRAMES[timeframe];
  return cached('candles', `${yahooSymbol}|${timeframe}`, tf.ttlMs, async (): Promise<Candle[]> => {
    const result = await yf.chart(yahooSymbol, {
      period1: new Date(Date.now() - tf.days * 86_400_000),
      interval: tf.source,
    });

    const candles: Candle[] = [];
    for (const q of result.quotes) {
      // Yahoo sometimes returns empty candles for minutes with no trades
      if (q.open == null || q.high == null || q.low == null || q.close == null) continue;
      candles.push({
        time: Math.floor(q.date.getTime() / 1000),
        open: round2(q.open),
        high: round2(q.high),
        low: round2(q.low),
        close: round2(q.close),
        volume: q.volume ?? 0,
      });
    }
    candles.sort((a, b) => a.time - b.time);

    return tf.bucket > 1 ? regroup(candles, 60 * tf.bucket) : candles;
  });
}