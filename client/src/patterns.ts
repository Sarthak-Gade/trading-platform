// Candlestick pattern detection. Pure functions: candles in, a list of patterns out.

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Bias = 'bullish' | 'bearish' | 'neutral';

export interface PatternHit {
  index: number; // index of the LAST candle of the pattern
  time: number;
  name: string;
  short: string; // short label drawn on the chart
  bias: Bias;
  candles: number; // how many candles make the pattern
  note: string;
}

const body = (c: Candle) => Math.abs(c.close - c.open);
const range = (c: Candle) => c.high - c.low;
const isGreen = (c: Candle) => c.close > c.open;
const isRed = (c: Candle) => c.close < c.open;
const upperShadow = (c: Candle) => c.high - Math.max(c.open, c.close);
const lowerShadow = (c: Candle) => Math.min(c.open, c.close) - c.low;

export function detectPatterns(candles: Candle[]): PatternHit[] {
  const hits: PatternHit[] = [];

  // Average body of the previous 14 candles, so "long" and "small" mean something for this stock
  const avgBodyAt = (i: number) => {
    const from = Math.max(0, i - 14);
    let sum = 0;
    let n = 0;
    for (let k = from; k < i; k++) {
      const c = candles[k];
      if (c) {
        sum += body(c);
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  };

  const downtrend = (i: number) => i >= 5 && (candles[i - 1]?.close ?? 0) < (candles[i - 5]?.close ?? 0);
  const uptrend = (i: number) => i >= 5 && (candles[i - 1]?.close ?? 0) > (candles[i - 5]?.close ?? 0);

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const p1 = candles[i - 1];
    const p2 = candles[i - 2];
    if (!c || !p1 || !p2 || range(c) === 0) continue;

    const avg = avgBodyAt(i);
    const add = (h: Omit<PatternHit, 'index' | 'time'>) => hits.push({ ...h, index: i, time: c.time });

    // ---- Three-candle patterns (checked first, they are the strongest signals)
    if (avg > 0) {
      if (
        isRed(p2) && body(p2) >= avg &&
        body(p1) <= avg * 0.5 &&
        isGreen(c) && c.close > (p2.open + p2.close) / 2
      ) {
        add({ name: 'Morning star', short: 'MS', bias: 'bullish', candles: 3, note: 'A long red candle, a small indecisive one, then a strong green candle: selling may be over.' });
        continue;
      }
      if (
        isGreen(p2) && body(p2) >= avg &&
        body(p1) <= avg * 0.5 &&
        isRed(c) && c.close < (p2.open + p2.close) / 2
      ) {
        add({ name: 'Evening star', short: 'ES', bias: 'bearish', candles: 3, note: 'A long green candle, a small indecisive one, then a strong red candle: buying may be over.' });
        continue;
      }
      if (
        [p2, p1, c].every((x) => isGreen(x) && body(x) >= avg * 0.7) &&
        p1.close > p2.close && c.close > p1.close &&
        p1.open > p2.open && p1.open < p2.close &&
        c.open > p1.open && c.open < p1.close
      ) {
        add({ name: 'Three white soldiers', short: '3W', bias: 'bullish', candles: 3, note: 'Three strong green candles in a row, each closing higher: buyers are in control.' });
        continue;
      }
      if (
        [p2, p1, c].every((x) => isRed(x) && body(x) >= avg * 0.7) &&
        p1.close < p2.close && c.close < p1.close &&
        p1.open < p2.open && p1.open > p2.close &&
        c.open < p1.open && c.open > p1.close
      ) {
        add({ name: 'Three black crows', short: '3B', bias: 'bearish', candles: 3, note: 'Three strong red candles in a row, each closing lower: sellers are in control.' });
        continue;
      }
    }

    // ---- Two-candle patterns
    if (isRed(p1) && isGreen(c) && c.open <= p1.close && c.close >= p1.open && body(c) > body(p1) && downtrend(i)) {
      add({ name: 'Bullish engulfing', short: 'BE', bias: 'bullish', candles: 2, note: 'A green candle fully covers the previous red one after a fall: buyers took over.' });
      continue;
    }
    if (isGreen(p1) && isRed(c) && c.open >= p1.close && c.close <= p1.open && body(c) > body(p1) && uptrend(i)) {
      add({ name: 'Bearish engulfing', short: 'SE', bias: 'bearish', candles: 2, note: 'A red candle fully covers the previous green one after a rise: sellers took over.' });
      continue;
    }

    // ---- One-candle patterns
    const b = body(c);
    const r = range(c);
    if (b <= r * 0.1) {
      add({ name: 'Doji', short: 'D', bias: 'neutral', candles: 1, note: 'Open and close are almost equal: the market is undecided.' });
      continue;
    }
    if (b > 0 && lowerShadow(c) >= b * 2 && upperShadow(c) <= b * 0.5 && downtrend(i)) {
      add({ name: 'Hammer', short: 'H', bias: 'bullish', candles: 1, note: 'A long lower shadow after a fall: sellers pushed down but buyers pushed back.' });
      continue;
    }
    if (b > 0 && upperShadow(c) >= b * 2 && lowerShadow(c) <= b * 0.5 && uptrend(i)) {
      add({ name: 'Shooting star', short: 'SS', bias: 'bearish', candles: 1, note: 'A long upper shadow after a rise: buyers pushed up but sellers pushed back.' });
      continue;
    }
  }

  return hits;
}