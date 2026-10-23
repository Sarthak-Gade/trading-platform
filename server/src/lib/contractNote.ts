    import PDFDocument from 'pdfkit';

export interface NoteTrade {
  id: string;
  executedAt: Date;
  symbol: string;
  side: 'buy' | 'sell';
  productType: string;
  qty: number;
  price: number;
  value: number;
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  sebiCharges: number;
  gst: number;
  stampDuty: number;
}

export interface ContractNoteData {
  date: string; // YYYY-MM-DD, the trading day in Indian time
  client: { name: string; email: string; mobile: string; clientCode: string; pan: string };
  trades: NoteTrade[];
  openingBalance: number | null;
  closingBalance: number | null;
}

const INK = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#2563eb';
const HEAD_BG = '#1e293b';
const ROW_BG = '#f1f5f9';
const LINE = '#cbd5e1';

const LEFT = 40;
const RIGHT = 555;
const PAGE_BOTTOM = 770;

function money(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function tradeCharges(t: NoteTrade): number {
  return t.brokerage + t.stt + t.exchangeCharges + t.sebiCharges + t.gst + t.stampDuty;
}

function maskPan(pan: string): string {
  return pan.length === 10 ? `${pan.slice(0, 3)}XXXX${pan.slice(7)}` : pan;
}

function istTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function contractNoteNumber(clientCode: string, date: string): string {
  return `CN-${clientCode}-${date.replace(/-/g, '')}`;
}

// Builds the PDF as a stream. The caller pipes it to the response.
export function buildContractNote(data: ContractNoteData): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Contract note ${data.date}`, Author: 'TradeSim' } });

  // ---- Header band
  doc.rect(0, 0, 595.28, 92).fill(HEAD_BG);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('TRADESIM', LEFT, 28);
  doc.font('Helvetica').fontSize(9).text('Paper trading platform for Indian stocks', LEFT, 54);
  doc.fontSize(8).fillColor('#cbd5e1').text('Simulated trades with virtual money. Not a real brokerage document.', LEFT, 68);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text('CONTRACT NOTE', 300, 26, { width: RIGHT - 300, align: 'right' });
  doc.font('Helvetica').fontSize(9)
    .text(`Note no: ${contractNoteNumber(data.client.clientCode, data.date)}`, 300, 48, { width: RIGHT - 300, align: 'right' })
    .text(`Trade date: ${data.date}`, 300, 62, { width: RIGHT - 300, align: 'right' })
    .text(`Client code: ${data.client.clientCode}`, 300, 76, { width: RIGHT - 300, align: 'right' });

  // ---- Client block
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('CLIENT', LEFT, 110);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(data.client.name.toUpperCase(), LEFT, 123);
  doc.font('Helvetica').fontSize(9).fillColor(INK)
    .text(`PAN: ${maskPan(data.client.pan)}`, LEFT, 141)
    .text(`Email: ${data.client.email}`, LEFT, 154)
    .text(`Mobile: ${data.client.mobile}`, LEFT, 167);

  // ---- Trades table
  const cols = [
    { label: 'TIME', x: LEFT, w: 52, align: 'left' as const },
    { label: 'TRADE NO', x: 94, w: 62, align: 'left' as const },
    { label: 'SYMBOL', x: 158, w: 84, align: 'left' as const },
    { label: 'PRODUCT', x: 244, w: 42, align: 'left' as const },
    { label: 'B/S', x: 288, w: 30, align: 'left' as const },
    { label: 'QTY', x: 318, w: 40, align: 'right' as const },
    { label: 'PRICE', x: 362, w: 54, align: 'right' as const },
    { label: 'VALUE', x: 420, w: 66, align: 'right' as const },
    { label: 'CHARGES', x: 490, w: 65, align: 'right' as const },
  ];

  function tableHeader(y: number) {
    doc.rect(LEFT, y, RIGHT - LEFT, 20).fill(HEAD_BG);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    for (const c of cols) doc.text(c.label, c.x + 2, y + 6, { width: c.w - 4, align: c.align, lineBreak: false });
  }

  let y = 196;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11).text('EXECUTED TRADES', LEFT, y);
  y += 18;
  tableHeader(y);
  y += 20;

  data.trades.forEach((t, i) => {
    if (y + 20 > PAGE_BOTTOM) {
      doc.addPage();
      y = 40;
      tableHeader(y);
      y += 20;
    }
    if (i % 2 === 0) doc.rect(LEFT, y, RIGHT - LEFT, 20).fill(ROW_BG);
    const cells = [
      istTime(t.executedAt),
      t.id.slice(0, 8).toUpperCase(),
      t.symbol,
      t.productType,
      t.side.toUpperCase(),
      String(t.qty),
      money(t.price),
      money(t.value),
      money(tradeCharges(t)),
    ];
    doc.font('Helvetica').fontSize(8);
    cols.forEach((c, k) => {
      const isSide = k === 4;
      doc.fillColor(isSide ? (t.side === 'buy' ? '#15803d' : '#b91c1c') : INK);
      if (isSide) doc.font('Helvetica-Bold');
      doc.text(cells[k] ?? '', c.x + 2, y + 6, { width: c.w - 4, align: c.align, lineBreak: false, ellipsis: true });
      if (isSide) doc.font('Helvetica');
    });
    y += 20;
  });
  doc.strokeColor(LINE).lineWidth(0.5).moveTo(LEFT, y).lineTo(RIGHT, y).stroke();

  // ---- Totals
  const sum = (f: (t: NoteTrade) => number) => data.trades.reduce((a, t) => a + f(t), 0);
  const buyValue = sum((t) => (t.side === 'buy' ? t.value : 0));
  const sellValue = sum((t) => (t.side === 'sell' ? t.value : 0));
  const charges = {
    brokerage: sum((t) => t.brokerage),
    stt: sum((t) => t.stt),
    exchange: sum((t) => t.exchangeCharges),
    sebi: sum((t) => t.sebiCharges),
    gst: sum((t) => t.gst),
    stamp: sum((t) => t.stampDuty),
  };
  const totalCharges = Object.values(charges).reduce((a, b) => a + b, 0);
  const net = sellValue - buyValue - totalCharges; // positive = money to receive, negative = money to pay

  // Keep the summary together: start a new page if it would be split
  if (y + 250 > PAGE_BOTTOM) {
    doc.addPage();
    y = 40;
  } else {
    y += 22;
  }

  const row = (label: string, value: string, opts: { bold?: boolean; color?: string; line?: boolean } = {}) => {
    if (opts.line) doc.strokeColor(INK).lineWidth(0.8).moveTo(LEFT, y - 3).lineTo(RIGHT, y - 3).stroke();
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(opts.color ?? INK);
    doc.text(label, LEFT + 4, y, { width: 300, lineBreak: false });
    doc.text(value, RIGHT - 160, y, { width: 156, align: 'right', lineBreak: false });
    y += 16;
  };

  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11).text('CHARGES BREAKDOWN', LEFT, y);
  y += 18;
  row('Brokerage', `INR ${money(charges.brokerage)}`);
  row('Securities Transaction Tax (STT)', `INR ${money(charges.stt)}`);
  row('Exchange transaction charges', `INR ${money(charges.exchange)}`);
  row('SEBI turnover fee', `INR ${money(charges.sebi)}`);
  row('GST (18% on brokerage, exchange and SEBI fees)', `INR ${money(charges.gst)}`);
  row('Stamp duty', `INR ${money(charges.stamp)}`);
  row('Total charges', `INR ${money(totalCharges)}`, { bold: true, line: true });

  y += 10;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11).text('NET OBLIGATION', LEFT, y);
  y += 18;
  row(`Total buy value (${data.trades.filter((t) => t.side === 'buy').length} trades)`, `INR ${money(buyValue)}`);
  row(`Total sell value (${data.trades.filter((t) => t.side === 'sell').length} trades)`, `INR ${money(sellValue)}`);
  row('Less: total charges', `INR ${money(totalCharges)}`);
  row(net >= 0 ? 'Net amount receivable' : 'Net amount payable', `INR ${money(Math.abs(net))}`, {
    bold: true,
    line: true,
    color: net >= 0 ? '#15803d' : '#b91c1c',
  });

  y += 10;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(11).text('WALLET', LEFT, y);
  y += 18;
  row('Balance at start of day', data.openingBalance === null ? '-' : `INR ${money(data.openingBalance)}`);
  row('Balance at end of day', data.closingBalance === null ? '-' : `INR ${money(data.closingBalance)}`, { bold: true });

  y += 14;
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
    'This contract note summarises simulated trades executed on TradeSim using virtual money. Buy orders are paid when placed, so "net payable" shows the day\'s settlement value, and the wallet balances above show the actual cash movement. Times are in Indian Standard Time.',
    LEFT, y, { width: RIGHT - LEFT }
  );

  // ---- Footer with page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    // Writing near the bottom margin would trigger an automatic page break, so lift the margin for this call
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.text(`${contractNoteNumber(data.client.clientCode, data.date)}  |  Page ${i + 1} of ${range.count}`, LEFT, 810, {
      width: RIGHT - LEFT,
      align: 'center',
      lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
  }

  return doc;
}