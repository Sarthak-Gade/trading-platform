import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import Icon from './Icon';

interface Account {
  dob: string;
  pan_no: string;
  gender: string;
  maritalStatus: string;
  occupation: string;
  incomeRange: string;
  uniqueClientCode: string;
  kycStatus: string;
  kycNote: string | null;
}

const INCOME = ['0-5L', '5-10L', '10-25L', '25L+'];

function Profile() {
  const { token } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
      .then((data: Account) => {
        setAccount(data);
        setOccupation(data.occupation);
        setIncomeRange(data.incomeRange);
        setLoaded(true);
      })
      .catch((err) => {
        if (err instanceof Error && /not found/i.test(err.message)) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Could not load your profile');
        setLoaded(true);
      });
  }, [token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const creating = notFound;
      const data: Account = await apiFetch('/api/me/account', token, {
        method: creating ? 'POST' : 'PATCH',
        body: JSON.stringify(
          creating
            ? { dob, pan_no: panNo.toUpperCase(), gender, maritalStatus, occupation, incomeRange }
            : { occupation, incomeRange }
        ),
      });
      setAccount(data);
      setNotFound(false);
      setMessage(creating ? 'KYC profile saved' : 'Profile updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile');
    }
  };

  if (!loaded) {
    return (
      <div className="card">
        <div className="skeleton" style={{ width: '100%', height: 160 }} />
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={save}>
      <div className="card-head" style={{ marginBottom: 0 }}>
        <span className="card-title">{notFound ? 'Complete your KYC' : 'KYC profile'}</span>
        {account && (
          <span
            className={`badge ${
              account.kycStatus === 'verified' ? 'badge-green' : account.kycStatus === 'rejected' ? 'badge-red' : 'badge-amber'
            }`}
          >
            KYC {account.kycStatus} · {account.uniqueClientCode}
          </span>
        )}
        {notFound && (
        <div className="notice notice-warn">
          <Icon name="alert-circle" size={16} /> You cannot trade until your KYC is submitted and verified.
        </div>
      )}
      {account?.kycStatus === 'pending' && (
        <div className="notice notice-info">
          <Icon name="clock" size={16} /> Your KYC is waiting for verification. Trading unlocks once it is approved.
        </div>
      )}
      {account?.kycStatus === 'rejected' && (
        <div className="notice notice-error">
          <Icon name="alert-circle" size={16} /> KYC rejected{account.kycNote ? `: ${account.kycNote}` : ''}. Update your
          details below and save to resubmit.
        </div>
      )}
      </div>

      {account && (
        <div className="profile-facts">
          <div className="fact"><small>PAN (locked)</small><span>{account.pan_no}</span></div>
          <div className="fact"><small>Date of birth (locked)</small><span>{new Date(account.dob).toLocaleDateString('en-IN')}</span></div>
          <div className="fact"><small>Gender</small><span>{account.gender}</span></div>
          <div className="fact"><small>Marital status</small><span>{account.maritalStatus}</span></div>
        </div>
      )}

      <div className="form-grid">
        {notFound && (
          <>
            <div className="field">
              <label className="label" htmlFor="dob">Date of birth</label>
              <input id="dob" className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="pan">PAN number</label>
              <input
                id="pan"
                className="input"
                placeholder="ABCDE1234F"
                maxLength={10}
                value={panNo}
                onChange={(e) => setPanNo(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="gender">Gender</label>
              <select id="gender" className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="marital">Marital status</label>
              <select id="marital" className="input" value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                <option>Single</option>
                <option>Married</option>
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label className="label" htmlFor="occupation">Occupation</label>
          <input id="occupation" className="input" value={occupation} onChange={(e) => setOccupation(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="income">Income range</label>
          <select id="income" className="input" value={incomeRange} onChange={(e) => setIncomeRange(e.target.value)}>
            {INCOME.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}
      {message && (
        <div className="notice notice-success" role="status">
          <Icon name="check-circle" size={16} /> {message}
        </div>
      )}

      <div>
        <button type="submit" className="btn btn-primary">
          {notFound ? 'Save KYC profile' : 'Update profile'}
        </button>
      </div>
    </form>
  );
}

export default Profile;
