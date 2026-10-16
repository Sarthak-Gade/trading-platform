import { useEffect, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import type { Instrument } from './types';
import Icon from './Icon';

interface Props {
  onSelect: (instrument: Instrument) => void;
  compact?: boolean;
  placeholder?: string;
  // Only the main dashboard search listens for Ctrl+K and "/"
  hotkeys?: boolean;
}

function InstrumentSearch({ onSelect, compact, placeholder, hotkeys }: Props) {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; items: Instrument[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  // Results only count while they belong to what is typed now
  const items = results && results.query === trimmed ? results.items : [];
  const loading = trimmed.length > 0 && (!results || results.query !== trimmed);

  // Debounced search
  useEffect(() => {
    if (!trimmed || !token) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch(`/api/instruments/search?q=${encodeURIComponent(trimmed)}`, token)
        .then((data: Instrument[]) => {
          if (!cancelled) setResults({ query: trimmed, items: data });
        })
        .catch(() => {
          if (!cancelled) setResults({ query: trimmed, items: [] });
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, token]);

  // Ctrl+K or "/" jumps to the search box
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys]);

  // Click outside closes the list
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (instrument: Instrument) => {
    onSelect(instrument);
    setQuery('');
    setResults(null);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const pick = items[active];
      if (pick) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`search${compact ? ' compact' : ''}`} ref={wrapRef}>
      <Icon name="search" size={16} className="lead" />
      <input
        ref={inputRef}
        className="input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label="Search stocks"
        autoComplete="off"
        placeholder={placeholder ?? 'Search stocks, e.g. RELIANCE, TCS, INFY'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span className="hint">
        <kbd>Ctrl</kbd>
        <kbd>K</kbd>
      </span>

      {open && trimmed && (
        <div className="search-menu" role="listbox">
          {loading ? (
            <div className="search-empty">Searching…</div>
          ) : items.length === 0 ? (
            <div className="search-empty">No stock found for “{trimmed}”</div>
          ) : (
            <>
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`search-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(item)}
                >
                  <span className="symbol-chip">{item.symbol.slice(0, 2)}</span>
                  <span>
                    <strong>{item.symbol}</strong>
                    <small>{item.name}</small>
                  </span>
                </button>
              ))}
              <div className="search-foot">
                <span>↑ ↓ to move</span>
                <span>Enter to select</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default InstrumentSearch;
