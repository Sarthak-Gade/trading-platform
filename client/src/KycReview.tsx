import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { openDocument } from './KycFiles';

interface Submission {
  id: string;
  userId: string;
  pan_no: string;
  dob: string;
  occupation: string | null;
  incomeRange: string | null;
  uniqueClientCode: string;
  kycStatus: string;
  kycNote: string | null;
  user: { fullName: string; email: string; mobNumber: string };
}

interface DocMeta {
  type: string;
  fileName: string;
}

const DOC_LABEL: Record<string, string> = { pan_card: 'PAN card', address_proof: 'Address proof', photo: 'Photo' };

// The documents one user uploaded, each opening in a new tab
function DocLinks({ userId, onError }: { userId: string; onError: (message: string) => void }) {
  const { token } = useAuth();
  const [info, setInfo] = useState<{ documents: DocMeta[]; missing: string[] } | null>(null);

  useEffect(() => {
    apiFetch(`/api/admin/kyc/${userId}/documents`, token)
      .then((data) => setInfo(data as { documents: DocMeta[]; missing: string[] }))
      .catch(() => setInfo({ documents: [], missing: [] }));
  }, [userId, token]);

  if (!info) return <small>Loading...</small>;

  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
      {info.documents.map((d) => (
        <button
          key={d.type}
          className="btn btn-ghost btn-sm"
          onClick={() =>
            void openDocument(`/api/admin/kyc/${userId}/documents/${d.type}/file`, token).catch((err) =>
              onError(err instanceof Error ? err.message : 'Could not open the document')
            )
          }
        >
          {DOC_LABEL[d.type] ?? d.type}
        </button>
      ))}
      {info.missing.length > 0 && (
        <small style={{ color: 'var(--amber, #f59e0b)' }}>
          Missing: {info.missing.map((t) => DOC_LABEL[t] ?? t).join(', ')}
        </small>
      )}
    </div>
  );
}

type Tab = 'pending' | 'verified' | 'rejected';

export default function KycReview() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<Submission[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

    // Bumping reloadKey re-runs the fetch below, so a decision can refresh the list
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    apiFetch(`/api/admin/kyc?status=${tab}`, token)
      .then((data) => {
        setRows(data as Submission[]);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load submissions'))
      .finally(() => setLoading(false));
  }, [token, tab, reloadKey]);

  async function review(row: Submission, decision: 'verified' | 'rejected') {
    let note = '';
    if (decision === 'rejected') {
      const reason = window.prompt('Reason for rejecting this KYC (the user will see it):', '');
      if (!reason || !reason.trim()) return;
      note = reason.trim();
    }
    try {
      await apiFetch(`/api/admin/kyc/${row.userId}/review`, token, {
        method: 'POST',
        body: JSON.stringify({ decision, note }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>KYC review</h1>
          <p>Approve a user to unlock trading, or reject with a reason.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['pending', 'verified', 'rejected'] as Tab[]).map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => {
              setLoading(true);
              setTab(t);
            }}>
            {t[0]?.toUpperCase()}
            {t.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="card card-flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>PAN</th>
                <th>Date of birth</th>
                <th>Occupation</th>
                <th>Income</th>
                <th>Client code</th>
                <th>Documents</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8}>Loading...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8}>No {tab} submissions.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.user.fullName}</strong>
                    <br />
                    <small>
                      {r.user.email} · {r.user.mobNumber}
                    </small>
                  </td>
                  <td>{r.pan_no}</td>
                  <td>{new Date(r.dob).toLocaleDateString('en-IN')}</td>
                  <td>{r.occupation ?? '-'}</td>
                  <td>{r.incomeRange ?? '-'}</td>
                  <td>{r.uniqueClientCode}</td>
                  <td> <DocLinks userId={r.userId} onError={setError} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.kycStatus !== 'verified' && (
                      <button className="btn btn-buy btn-sm" onClick={() => void review(r, 'verified')}>
                        Approve
                      </button>
                    )}{' '}
                    {r.kycStatus !== 'rejected' && (
                      <button className="btn btn-danger btn-sm" onClick={() => void review(r, 'rejected')}>
                        Reject
                      </button>
                    )}
                    {r.kycStatus === 'rejected' && r.kycNote && <small> {r.kycNote}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}