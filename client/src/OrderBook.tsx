import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useBalance } from './context/BalanceContext';
import { apiFetch } from './api';
import { formatDateTime, inr } from './format';
import Icon from './Icon';

interface Order {
  id: string;
  type: string;
  orderType: string;
  productType: string;
  qty: number;
  orderPrice: string;
  triggerPrice?: string | null;
  note?: string | null;
  status: string;
  createdAt: string;
  instrument: { id: string; symbol: string; name?: string };
}

const STATUS_BADGE: Record<string, string> = {
  executed: 'badge-green',
  pending: 'badge-amber',
  cancelled: 'badge-gray',
  rejected: 'badge-red',
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  stop_loss: 'stop-loss',
  take_profit: 'take-profit',
};

// `instrumentId` limits the list to one stock (used by the terminal)
function OrderBook({ refreshKey, instrumentId }: { refreshKey: number; instrumentId?: string }) {
  const { token } = useAuth();
  const { refresh: refreshBalance } = useBalance();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch('/api/me/orders', token)
      .then((data: Order[]) => {
        setOrders(data);
        setError('');
      })
      .catch(() => setError('Could not load orders'));
  }, [token]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  const cancel = async (id: string) => {
    setCancelling(id);
    try {
      await apiFetch(`/api/orders/${id}/cancel`, token, { method: 'POST' });
      load();
      refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the order');
    } finally {
      setCancelling(null);
    }
  };

  if (!orders && !error) return <div className="skeleton" style={{ width: '100%', height: 120 }} />;

  const shown = instrumentId ? (orders ?? []).filter((o) => o.instrument.id === instrumentId) : (orders ?? []);

  return (
    <>
      {error && (
        <div className="notice notice-error" style={{ marginBottom: 12 }}>
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}
      {orders && shown.length === 0 ? (
        <div className="empty">
          <Icon name="inbox" size={32} />
          No orders yet. Place your first order from the ticket above.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Side</th>
                <th>Product</th>
                <th className="num">Qty</th>
                <th className="num">Price</th>
                <th>Status</th>
                <th>Placed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div className="sym">
                      <span className="symbol-chip">{o.instrument.symbol.slice(0, 2)}</span>
                      <strong>{o.instrument.symbol}</strong>
                    </div>
                  </td>
                  <td className={o.type === 'buy' ? 'up' : 'down'} style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                    {o.type}
                  </td>
                  <td>
                    {o.productType} · <span className="muted">{ORDER_TYPE_LABEL[o.orderType] ?? o.orderType}</span>
                  </td>
                  <td className="num">{o.qty}</td>
                                    <td className="num">
                    {inr(Number(o.orderPrice))}
                    {o.triggerPrice && o.status === 'pending' && (
                      <div className="muted" style={{ fontSize: 11 }}>trigger {inr(Number(o.triggerPrice))}</div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[o.status] ?? 'badge-gray'}`}>{o.status}</span>
                    {o.note && <div className="muted" style={{ fontSize: 11, maxWidth: 180 }}>{o.note}</div>}
                  </td>
                  <td className="muted nowrap">{formatDateTime(o.createdAt)}</td>
                  <td className="num">
                    {o.status === 'pending' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={cancelling === o.id}
                        onClick={() => cancel(o.id)}
                      >
                        {cancelling === o.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default OrderBook;
