import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import Icon from './Icon';

interface Bank {
  id: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  status: string;
}

function BankAccounts() {
  const { token } = useAuth();
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch('/api/me/banks', token)
      .then((data: Bank[]) => setBanks(data))
      .catch(() => setError('Could not load bank accounts'));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/me/banks', token, {
        method: 'POST',
        body: JSON.stringify({ accountNumber, ifscCode: ifscCode.toUpperCase(), bankBranch }),
      });
      setAccountNumber('');
      setIfscCode('');
      setBankBranch('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the bank account');
    }
  };

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/me/banks/${id}`, token, { method: 'DELETE' });
      load();
    } catch {
      setError('Could not remove the bank account');
    }
  };

  return (
    <div className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <span className="card-title">Linked bank accounts</span>
      </div>

      <form className="inline-form" onSubmit={add}>
        <div className="field">
          <label className="label" htmlFor="acc">Account number</label>
          <input id="acc" className="input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="ifsc">IFSC</label>
          <input id="ifsc" className="input" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="branch">Branch</label>
          <input id="branch" className="input" value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary">
          <Icon name="plus" size={16} /> Add
        </button>
      </form>

      {error && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      {banks && banks.length === 0 ? (
        <div className="empty">
          <Icon name="bank" size={32} />
          No bank account linked yet.
        </div>
      ) : (
        <ul className="list">
          {(banks ?? []).map((b) => (
            <li key={b.id} className="list-item">
              <span className="stat-icon blue" style={{ width: 36, height: 36 }}><Icon name="bank" size={18} /></span>
              <div className="list-main">
                <strong>{b.bankBranch}</strong>
                <small>A/C ••••{b.accountNumber.slice(-4)} · {b.ifscCode}</small>
              </div>
              <span className={`badge ${b.status === 'verified' ? 'badge-green' : 'badge-amber'}`}>{b.status}</span>
              <button type="button" className="icon-btn danger" aria-label="Remove bank account" onClick={() => remove(b.id)}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BankAccounts;
