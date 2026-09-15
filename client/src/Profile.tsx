import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface Account {
  dob: string;
  pan_no: string;
  gender: string;
  maritalStatus: string;
  occupation: string;
  incomeRange: string;
  uniqueClientCode: string;
}

function Profile() {
  const { token } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [dob, setDob] = useState('');
  const [panNo, setPanNo] = useState('');
  const [gender, setGender] = useState('Male');
  const [maritalStatus, setMaritalStatus] = useState('Single');
  const [occupation, setOccupation] = useState('');
  const [incomeRange, setIncomeRange] = useState('0-5L');

  useEffect(() => {
    apiFetch('/api/me/account', token)
      .then((data) => {
        setAccount(data);
        setOccupation(data.occupation);
        setIncomeRange(data.incomeRange);
      })
      .catch(() => setNotFound(true));
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const data = await apiFetch('/api/me/account', token, {
        method: 'POST',
        body: JSON.stringify({ dob, pan_no: panNo, gender, maritalStatus, occupation, incomeRange }),
      });
      setAccount(data);
      setNotFound(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save account details');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      const data = await apiFetch('/api/me/account', token, {
        method: 'PATCH',
        body: JSON.stringify({ occupation, incomeRange }),
      });
      setAccount(data);
      setMessage('Profile updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update account details');
    }
  };

  if (notFound) {
    return (
      <div style={{ marginBottom: '2rem', border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', maxWidth: '400px' }}>
        <h2>Complete Your KYC Profile</h2>
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Date of Birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required style={{ width: '100%', padding: '0.4rem' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>PAN Number</label>
            <input type="text" value={panNo} onChange={(e) => setPanNo(e.target.value)} required style={{ width: '100%', padding: '0.4rem' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </select>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Marital Status</label>
            <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
              <option>Single</option>
              <option>Married</option>
            </select>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Occupation</label>
            <input type="text" value={occupation} onChange={(e) => setOccupation(e.target.value)} required style={{ width: '100%', padding: '0.4rem' }} />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label>Income Range</label>
            <select value={incomeRange} onChange={(e) => setIncomeRange(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
              <option value="0-5L">0-5L</option>
              <option value="5-10L">5-10L</option>
              <option value="10-25L">10-25L</option>
              <option value="25L+">25L+</option>
            </select>
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit">Save Profile</button>
        </form>
      </div>
    );
  }

  if (!account) return <p>Loading profile...</p>;

  return (
    <div style={{ marginBottom: '2rem', border: '1px solid #ccc', borderRadius: '8px', padding: '1rem', maxWidth: '400px' }}>
      <h2>Profile</h2>
      <p><strong>Client Code:</strong> {account.uniqueClientCode}</p>
      <p><strong>PAN:</strong> {account.pan_no} <em>(locked)</em></p>
      <p><strong>DOB:</strong> {new Date(account.dob).toLocaleDateString()} <em>(locked)</em></p>
      <p><strong>Gender:</strong> {account.gender}</p>
      <p><strong>Marital Status:</strong> {account.maritalStatus}</p>

      <form onSubmit={handleUpdate}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>Occupation</label>
          <input type="text" value={occupation} onChange={(e) => setOccupation(e.target.value)} style={{ width: '100%', padding: '0.4rem' }} />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>Income Range</label>
          <select value={incomeRange} onChange={(e) => setIncomeRange(e.target.value)} style={{ width: '100%', padding: '0.4rem' }}>
            <option value="0-5L">0-5L</option>
            <option value="5-10L">5-10L</option>
            <option value="10-25L">10-25L</option>
            <option value="25L+">25L+</option>
          </select>
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        <button type="submit">Update</button>
      </form>
    </div>
  );
}

export default Profile;