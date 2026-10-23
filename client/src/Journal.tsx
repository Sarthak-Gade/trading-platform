import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface JournalEntry {
  id: string;
  strategy: string | null;
  entryReason: string | null;
  exitReason: string | null;
  notes: string | null;
  learnings: string | null;
  createdAt: string;
  trade: {
    pricePerShare: string;
    sharesQty: number;
    instrument: { symbol: string };
    order: { type: string };
  } | null;
}

interface TradeOption {
  id: string;
  pricePerShare: string;
  sharesQty: number;
  instrument: { symbol: string };
}

const emptyForm = { tradeId: '', strategy: '', entryReason: '', exitReason: '', notes: '', learnings: '' };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function Journal() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trades, setTrades] = useState<TradeOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

   // Bumping reloadKey re-runs the fetch below, so every save or delete can refresh the list
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    Promise.all([apiFetch('/api/me/journal', token), apiFetch('/api/me/trades', token)])
      .then(([journal, tradeList]) => {
        setEntries(journal as JournalEntry[]);
        setTrades(tradeList as TradeOption[]);
      })
      .catch((err) => setError(errorMessage(err, 'Could not load the journal')));
  }, [token, reloadKey]);

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const { tradeId, ...text } = form;
      // Editing sends only the text fields: the trade link is fixed when the entry is created
      const body = editingId ? text : { ...text, tradeId };

      await apiFetch(editingId ? `/api/me/journal/${editingId}` : '/api/me/journal', token, {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });

      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the entry'));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(entry: JournalEntry) {
    setError('');
    setEditingId(entry.id);
    setForm({
      tradeId: '',
      strategy: entry.strategy ?? '',
      entryReason: entry.entryReason ?? '',
      exitReason: entry.exitReason ?? '',
      notes: entry.notes ?? '',
      learnings: entry.learnings ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this journal entry?')) return;
    setError('');
    try {
      await apiFetch(`/api/me/journal/${id}`, token, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete the entry'));
    }
  }

    return (
    <div className="journal">
      <div className="journal-head">
        <h2>Trading Journal</h2>
        <p>Record why you entered, why you exited, and what you learned.</p>
      </div>

      <form className="journal-form" onSubmit={submit}>
        <h3>{editingId ? 'Edit entry' : 'New entry'}</h3>

        <div className="journal-row">
          {!editingId && (
            <label className="journal-field">
              <span>Linked trade</span>
              <select value={form.tradeId} onChange={(e) => set('tradeId', e.target.value)}>
                <option value="">General note (no trade)</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.instrument.symbol} - {t.sharesQty} @ ₹{t.pricePerShare}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="journal-field">
            <span>Strategy</span>
            <input
              placeholder="e.g. Breakout, Support bounce"
              value={form.strategy}
              onChange={(e) => set('strategy', e.target.value)}
            />
          </label>
        </div>

        <div className="journal-row">
          <label className="journal-field">
            <span>Entry reasoning</span>
            <textarea
              rows={2}
              placeholder="Why did you enter?"
              value={form.entryReason}
              onChange={(e) => set('entryReason', e.target.value)}
            />
          </label>
          <label className="journal-field">
            <span>Exit reasoning</span>
            <textarea
              rows={2}
              placeholder="Why did you exit?"
              value={form.exitReason}
              onChange={(e) => set('exitReason', e.target.value)}
            />
          </label>
        </div>

        <label className="journal-field">
          <span>Observations</span>
          <textarea
            rows={2}
            placeholder="Market behaviour, emotions, details"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </label>

        <label className="journal-field lesson">
          <span>Key lessons</span>
          <textarea
            rows={2}
            placeholder="What will you do differently next time?"
            value={form.learnings}
            onChange={(e) => set('learnings', e.target.value)}
          />
        </label>

        {error && <p className="journal-error">{error}</p>}

        <div className="journal-actions">
          <button type="submit" className="jbtn jbtn-primary" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add entry'}
          </button>
          {editingId && (
            <button type="button" className="jbtn jbtn-ghost" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {entries.length === 0 && (
        <div className="journal-empty">No entries yet. Write your first one above.</div>
      )}

      {entries.map((entry) => {
        const side = entry.trade ? (entry.trade.order.type === 'sell' ? 'sell' : 'buy') : 'note';
        return (
          <article key={entry.id} className={`j-entry ${side}`}>
            <div className="j-top">
              <div className="j-title">
                <span className="j-symbol">{entry.trade ? entry.trade.instrument.symbol : 'General note'}</span>
                <span className={`j-badge ${side}`}>{side === 'note' ? 'NOTE' : side.toUpperCase()}</span>
                {entry.trade && (
                  <span className="j-detail">
                    {entry.trade.sharesQty} @ ₹{entry.trade.pricePerShare}
                  </span>
                )}
                {entry.strategy && <span className="j-tag">{entry.strategy}</span>}
              </div>
              <span className="j-date">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>

            <div className="j-blocks">
              {entry.entryReason && (
                <div className="j-block">
                  <span>Entry</span>
                  {entry.entryReason}
                </div>
              )}
              {entry.exitReason && (
                <div className="j-block">
                  <span>Exit</span>
                  {entry.exitReason}
                </div>
              )}
              {entry.notes && (
                <div className="j-block wide">
                  <span>Observations</span>
                  {entry.notes}
                </div>
              )}
              {entry.learnings && (
                <div className="j-block wide lesson">
                  <span>Key lesson</span>
                  {entry.learnings}
                </div>
              )}
            </div>

            <div className="j-entry-actions">
              <button className="jbtn jbtn-ghost" onClick={() => startEdit(entry)}>
                Edit
              </button>
              <button className="jbtn jbtn-danger" onClick={() => void remove(entry.id)}>
                Delete
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}