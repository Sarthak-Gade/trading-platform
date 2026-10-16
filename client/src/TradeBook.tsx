import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { formatDateTime, inr } from './format';
import Icon from './Icon';

interface Trade {
  id: string;
  pricePerShare: string;
  sharesQty: number;
  totalPrice: string;
  brokerage: string;
  stt: string;
  exchangeCharges: string;
  sebiCharges: string;
  gst: string;
  stampDuty: string;
  executedAt: string;
  instrument: { symbol: string };
}

// Older trades only have a brokerage value; the other charge columns are 0 for them
function totalCharges(t: Trade): number {
  return (
    Number(t.brokerage) + Number(t.stt) + Number(t.exchangeCharges) +
    Number(t.sebiCharges) + Number(t.gst) + Number(t.stampDuty)
  );
}

function breakdown(t: Trade): string {
  return (
    `Brokerage ₹${t.brokerage}, STT ₹${t.stt}, Exchange ₹${t.exchangeCharges}, ` +
    `SEBI ₹${t.sebiCharges}, GST ₹${t.gst}, Stamp duty ₹${t.stampDuty}`
  );
}

function TradeBook({ refreshKey }: { refreshKey: number }) {
  const { token } = useAuth();
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/trades', token)
      .then((data: Trade[]) => {
        setTrades(data);
        setError('');
      })
      .catch(() => setError('Could not load trades'));
  }, [token, refreshKey]);

  if (error) {
    return (
      <div className="notice notice-error">
        <Icon name="alert-circle" size={16} /> {error}
      </div>
    );
  }
  if (!trades) return <div className="skeleton" style={{ width: '100%', height: 120 }} />;
  if (trades.length === 0) {
    return (
      <div className="empty">
        <Icon name="repeat" size={32} />
        No trades executed yet.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Stock</th>
            <th className="num">Qty</th>
            <th className="num">Price</th>
            <th className="num">Value</th>
            <th className="num">Charges</th>
            <th>Executed</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="sym">
                  <span className="symbol-chip">{t.instrument.symbol.slice(0, 2)}</span>
                  <strong>{t.instrument.symbol}</strong>
                </div>
              </td>
              <td className="num">{t.sharesQty}</td>
              <td className="num">{inr(Number(t.pricePerShare))}</td>
              <td className="num">{inr(Number(t.totalPrice))}</td>
              <td className="num" title={breakdown(t)} style={{ cursor: 'help' }}>
                {inr(totalCharges(t))}
              </td>
              <td className="muted nowrap">{formatDateTime(t.executedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TradeBook;
