/**
 * Indian equity trading charges (brokerage, STT, exchange fee, SEBI fee, GST, stamp duty).
 *
 * Rates follow the TradeArena project. They are a simulation of typical NSE equity charges,
 * not a statement of what any real broker charges today.
 *
 * Every amount is rounded to 2 decimals (paise), and totalCharges is the sum of the rounded parts,
 * so the numbers shown to the user always add up exactly.
 */

export interface ChargesInput {
  direction: 'buy' | 'sell';
  quantity: number;
  price: number;
  // MIS is intraday. Everything else (CNC, NRML) is charged at delivery rates.
  productType: string;
}

export interface Charges {
  tradeValue: number;
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  sebiCharges: number;
  gst: number;
  stampDuty: number;
  totalCharges: number;
}

// Brokerage: a percentage of trade value, capped at a flat maximum per order
const BROKERAGE_RATE_DELIVERY = 0.0005; // 0.05%
const BROKERAGE_RATE_INTRADAY = 0.0003; // 0.03%
const BROKERAGE_MAX = 20;

// Securities Transaction Tax
const STT_RATE_DELIVERY = 0.001; // 0.1% on both buy and sell
const STT_RATE_INTRADAY_SELL = 0.00025; // 0.025% on sell only

const EXCHANGE_RATE = 0.0000345; // 0.00345% of trade value (NSE equity)
const SEBI_RATE = 0.000001; // 0.0001% of trade value (Rs 10 per crore)
const GST_RATE = 0.18; // on brokerage + exchange charges + SEBI fee

// Stamp duty: buy side only
const STAMP_RATE_DELIVERY = 0.00015; // 0.015%
const STAMP_RATE_INTRADAY = 0.00003; // 0.003%

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateCharges({ direction, quantity, price, productType }: ChargesInput): Charges {
  const isIntraday = productType === 'MIS';
  const tradeValue = round2(quantity * price);

  const brokerage = round2(
    Math.min(tradeValue * (isIntraday ? BROKERAGE_RATE_INTRADAY : BROKERAGE_RATE_DELIVERY), BROKERAGE_MAX)
  );

  let sttRate = STT_RATE_DELIVERY;
  if (isIntraday) {
    sttRate = direction === 'sell' ? STT_RATE_INTRADAY_SELL : 0;
  }
  const stt = round2(tradeValue * sttRate);

  const exchangeCharges = round2(tradeValue * EXCHANGE_RATE);
  const sebiCharges = round2(tradeValue * SEBI_RATE);
  const gst = round2((brokerage + exchangeCharges + sebiCharges) * GST_RATE);

  let stampRate = 0;
  if (direction === 'buy') {
    stampRate = isIntraday ? STAMP_RATE_INTRADAY : STAMP_RATE_DELIVERY;
  }
  const stampDuty = round2(tradeValue * stampRate);

  const totalCharges = round2(brokerage + stt + exchangeCharges + sebiCharges + gst + stampDuty);

  return { tradeValue, brokerage, stt, exchangeCharges, sebiCharges, gst, stampDuty, totalCharges };
}