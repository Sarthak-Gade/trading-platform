import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';

interface InstrumentResult {
  id: string;
  symbol: string;
  name: string;
}

function InstrumentSearch({ onSelect }: { onSelect: (instrument: InstrumentResult) => void }) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InstrumentResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleChange = async (value: string) => {
    setQuery(value);

    if (value.trim().length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }

    try {
      const data = await apiFetch(`/api/instruments/search?q=${encodeURIComponent(value)}`, token);
      setResults(data);
      setShowResults(true);
    } catch {
      setResults([]);
    }
  };

  const handleSelect = (instrument: InstrumentResult) => {
    onSelect(instrument);
    setQuery(`${instrument.symbol} — ${instrument.name}`);
    setShowResults(false);
  };

  return (
    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
      <input
        type="text"
        placeholder="Search stocks by name or symbol..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        style={{ width: '100%', padding: '0.5rem' }}
      />
      {showResults && results.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#1a1d29',
            border: '1px solid #2a2f42',
            borderRadius: '6px',
            maxHeight: '250px',
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: '0.25rem 0',
            zIndex: 10,
          }}
        >
          {results.map((r) => (
            <li
              key={r.id}
              onClick={() => handleSelect(r)}
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#22263a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <strong>{r.symbol}</strong> — {r.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default InstrumentSearch;