import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAuth } from './context/AuthContext';
import { API_BASE, apiFetch } from './api';
import { openDocument } from './KycFiles';
import Icon from './Icon';

interface DocMeta {
  type: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

interface DocList {
  documents: DocMeta[];
  required: string[];
  missing: string[];
}

const SLOTS = [
  { type: 'pan_card', label: 'PAN card', hint: 'A photo or scan of your PAN card', required: true },
  { type: 'address_proof', label: 'Address proof', hint: 'Aadhaar, passport or driving licence', required: true },
  { type: 'photo', label: 'Photo', hint: 'A clear passport-size photo (JPG or PNG)', required: false },
];

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Props {
  kycStatus: string;
  // Called after a change, so the page can refresh the KYC status (a rejected KYC goes back to pending)
  onChanged: () => void;
}

export default function KycDocuments({ kycStatus, onChanged }: Props) {
  const { token } = useAuth();
  const [list, setList] = useState<DocList | null>(null);
  const [error, setError] = useState('');
  const [busyType, setBusyType] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const locked = kycStatus === 'verified';

  useEffect(() => {
    apiFetch('/api/me/kyc/documents', token)
      .then((data) => setList(data as DocList))
      .catch((err) => setError(errorMessage(err, 'Could not load your documents')));
  }, [token, reloadKey]);

  function changed() {
    setReloadKey((k) => k + 1);
    onChanged();
  }

  async function upload(type: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (!file) return;

    setError('');
    if (!ALLOWED.includes(file.type)) {
      setError('Only JPG, PNG or PDF files are accepted');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than 5 MB');
      return;
    }

    setBusyType(type);
    try {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/me/kyc/documents/${type}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'Content-Type': file.type,
            'X-File-Name': encodeURIComponent(file.name),
          },
          body: file,
        });
      } catch {
        throw new Error('Could not connect to the server. Is it running?');
      }
      if (!res.ok) {
        if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
        let message = 'Could not upload the document';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // not JSON
        }
        throw new Error(message);
      }
      changed();
    } catch (err) {
      setError(errorMessage(err, 'Could not upload the document'));
    } finally {
      setBusyType('');
    }
  }

  async function view(type: string) {
    setError('');
    try {
      await openDocument(`/api/me/kyc/documents/${type}/file`, token);
    } catch (err) {
      setError(errorMessage(err, 'Could not open the document'));
    }
  }

  async function remove(type: string) {
    if (!window.confirm('Remove this document?')) return;
    setError('');
    try {
      await apiFetch(`/api/me/kyc/documents/${type}`, token, { method: 'DELETE' });
      changed();
    } catch (err) {
      setError(errorMessage(err, 'Could not remove the document'));
    }
  }

  return (
    <div className="card stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <span className="card-title">KYC documents</span>
        {list && list.missing.length > 0 && !locked && <span className="badge badge-amber">{list.missing.length} required missing</span>}
        {list && list.missing.length === 0 && <span className="badge badge-green">Required documents uploaded</span>}
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {locked
          ? 'Your KYC is verified, so your documents are locked.'
          : 'Upload clear copies as JPG, PNG or PDF, up to 5 MB each. An admin reviews them before approving your KYC.'}
      </p>

      {error && (
        <div className="notice notice-error" role="alert">
          <Icon name="alert-circle" size={16} /> {error}
        </div>
      )}

      <div className="kyc-docs">
        {SLOTS.map((slot) => {
          const doc = list?.documents.find((d) => d.type === slot.type);
          return (
            <div key={slot.type} className="kyc-doc">
              <div className="kyc-doc-info">
                <strong>
                  {slot.label} {slot.required ? <span className="kyc-req">required</span> : <span className="muted">optional</span>}
                </strong>
                {doc ? (
                  <small>
                    {doc.fileName} · {fmtSize(doc.size)}
                  </small>
                ) : (
                  <small className="muted">{slot.hint}</small>
                )}
              </div>
              <div className="kyc-doc-actions">
                {doc && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void view(slot.type)}>
                    View
                  </button>
                )}
                {!locked && (
                  <label className={`btn btn-ghost btn-sm${busyType === slot.type ? ' disabled' : ''}`}>
                    {busyType === slot.type ? 'Uploading...' : doc ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      hidden
                      accept={slot.type === 'photo' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,application/pdf'}
                      disabled={busyType !== ''}
                      onChange={(e) => void upload(slot.type, e)}
                    />
                  </label>
                )}
                {doc && !locked && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(slot.type)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}