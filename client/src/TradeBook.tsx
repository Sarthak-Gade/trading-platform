import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

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

function TradeBook() {
  const { token } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/me/trades', token)
      .then((data) => setTrades(data))
      .catch(() => setError('Could not load trade history'));
  }, [token]);

  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Trade Book</h2>
      {trades.length === 0 ? (
        <p>No trades executed yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '800px' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Symbol</th>
              <th style={cellStyle}>Qty</th>
              <th style={cellStyle}>Price/Share</th>
              <th style={cellStyle}>Charges</th>
              <th style={cellStyle}>Total</th>
              <th style={cellStyle}>Executed At</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td style={cellStyle}>{t.instrument.symbol}</td>
                <td style={cellStyle}>{t.sharesQty}</td>
                <td style={cellStyle}>₹{t.pricePerShare}</td>
                <td style={cellStyle} title={chargesBreakdown(t)}>
                  ₹{totalCharges(t).toFixed(2)}
                </td>
                <td style={cellStyle}>₹{t.totalPrice}</td>
                <td style={cellStyle}>{new Date(t.executedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Older trades only have a brokerage value; the other charge columns are 0 for them
function totalCharges(t: Trade): number {
  return (
    Number(t.brokerage) + Number(t.stt) + Number(t.exchangeCharges) +
    Number(t.sebiCharges) + Number(t.gst) + Number(t.stampDuty)
  );
}

function chargesBreakdown(t: Trade): string {
  return (
    `Brokerage ₹${t.brokerage}, STT ₹${t.stt}, Exchange ₹${t.exchangeCharges}, ` +
    `SEBI ₹${t.sebiCharges}, GST ₹${t.gst}, Stamp duty ₹${t.stampDuty}`
  );
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '0.5rem',
  textAlign: 'left',
};

export default TradeBook;