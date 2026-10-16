export interface Quote {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  marketState: string | null;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
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
