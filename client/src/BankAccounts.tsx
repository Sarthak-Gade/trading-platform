import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Bank {
  id: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  status: string;
}

function BankAccounts() {
  const { token } = useAuth();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [error, setError] = useState('');

  const fetchBanks = () => {
    apiFetch('/api/me/banks', token)
      .then((data) => setBanks(data))
      .catch(() => setError('Could not load bank accounts'));
  };

  useEffect(() => {
    fetchBanks();
  }, [token]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await apiFetch('/api/me/banks', token, {
        method: 'POST',
        body: JSON.stringify({ accountNumber, ifscCode, bankBranch }),
      });
      setAccountNumber('');
      setIfscCode('');
      setBankBranch('');
      fetchBanks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add bank account');
    }
  };

  const handleDelete = async (bankId: string) => {
    try {
      await apiFetch(`/api/me/banks/${bankId}`, token, { method: 'DELETE' });
      fetchBanks();
    } catch {
      setError('Could not remove bank account');
    }
  };

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Linked Bank Accounts</h2>

      <form onSubmit={handleAdd} style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Account number"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          required
          style={{ padding: '0.4rem', marginRight: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="IFSC code"
          value={ifscCode}
          onChange={(e) => setIfscCode(e.target.value)}
          required
          style={{ padding: '0.4rem', marginRight: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="Branch"
          value={bankBranch}
          onChange={(e) => setBankBranch(e.target.value)}
          required
          style={{ padding: '0.4rem', marginRight: '0.5rem' }}
        />
        <button type="submit">Add Bank</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {banks.length === 0 ? (
        <p>No bank accounts linked.</p>
      ) : (
        <ul>
          {banks.map((b) => (
            <li key={b.id}>
              {b.bankBranch} — A/C ****{b.accountNumber.slice(-4)} — {b.ifscCode} —{' '}
              <span style={{ color: b.status === 'verified' ? 'green' : '#b8860b', fontWeight: 'bold' }}>
                {b.status}
              </span>{' '}
              <button onClick={() => handleDelete(b.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BankAccounts;