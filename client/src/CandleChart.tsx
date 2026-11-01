import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts';
import { useAuth } from './context/AuthContext';
import { apiFetch } from './api';
import { inr } from './format';
import { detectPatterns } from './patterns';
import type { Candle } from './patterns';

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '1D', '1W'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const UP = '#10b981';
const DOWN = '#ef4444';
const NEUTRAL = '#fbbf24';
const IST_OFFSET = 5.5 * 3600; // the chart draws UTC, so shift candles to show Indian time
const REFRESH_MS = 30_000;

interface Props {
  // 'instrument' uses a stock's database id, 'index' uses a key such as NIFTY50
  kind: 'instrument' | 'index';
  id: string;
}

interface Loaded {
  key: string;
  candles: Candle[];
  stale: boolean;
}

interface Legend {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function formatWhen(time: number, tf: Timeframe): string {
  const d = new Date((time + IST_OFFSET) * 1000);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  if (tf === '1D' || tf === '1W') return date;
  const clock = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  return `${date}, ${clock}`;
}

function CandleChart({ kind, id }: Props) {
  const { token } = useAuth();
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [showPatterns, setShowPatterns] = useState(true);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const fittedKeyRef = useRef('');

  const key = `${kind}:${id}:${timeframe}`;

  // Load candles, and refresh while the chart is open
  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    const path =
      kind === 'index'
        ? `/api/market/indices/${encodeURIComponent(id)}/candles?timeframe=${timeframe}`
        : `/api/instruments/${encodeURIComponent(id)}/candles?timeframe=${timeframe}`;

    const load = () => {
      apiFetch(path, token)
        .then((res: { candles: Candle[]; stale?: boolean }) => {
          if (cancelled) return;
          setData({ key, candles: res.candles, stale: Boolean(res.stale) });
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError({ key, message: err instanceof Error ? err.message : 'Could not load the chart' });
        });
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, kind, id, timeframe, key]);

  // Create the chart once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(31,41,55,0.5)' },
        horzLines: { color: 'rgba(31,41,55,0.5)' },
      },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: '#374151' }, horzLine: { color: '#374151' } },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });

    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData.get(candles);
      if (param.time && point && 'open' in point) {
        setLegend({ time: (param.time as number) - IST_OFFSET, open: point.open, high: point.high, low: point.low, close: point.close });
      } else {
        setLegend(null);
      }
    });

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    markersRef.current = createSeriesMarkers(candles, []);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Only use data that belongs to what is on screen right now
  const current = data && data.key === key ? data : null;
  const candles = current?.candles;
  const hits = candles ? detectPatterns(candles) : [];

  // Draw the candles
  useEffect(() => {
    const candleSeries = candleRef.current;
    const volumeSeries = volumeRef.current;
    if (!candleSeries || !volumeSeries) return;

    if (!candles) {
      candleSeries.setData([]);
      volumeSeries.setData([]);
      return;
    }

    // The chart needs strictly increasing times
    const clean: Candle[] = [];
    for (const c of candles) {
      const last = clean[clean.length - 1];
      if (!last || c.time > last.time) clean.push(c);
    }

    candleSeries.setData(
      clean.map((c) => ({ time: (c.time + IST_OFFSET) as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    volumeSeries.setData(
      clean.map((c) => ({
        time: (c.time + IST_OFFSET) as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
      }))
    );

    // Zoom to fit only when the stock or timeframe changed, not on every refresh
    if (fittedKeyRef.current !== key) {
      fittedKeyRef.current = key;
      const total = clean.length;
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - 90), to: total + 3 });
    }
  }, [candles, key]);

  // Draw the pattern markers
  const hitSignature = hits.map((h) => `${h.time}${h.short}`).join('|');
  useEffect(() => {
    const plugin = markersRef.current;
    if (!plugin) return;
    if (!showPatterns || !candles) {
      plugin.setMarkers([]);
      return;
    }
    const markers: SeriesMarker<Time>[] = detectPatterns(candles).map((h) => ({
      time: (h.time + IST_OFFSET) as UTCTimestamp,
      position: h.bias === 'bearish' ? 'aboveBar' : 'belowBar',
      shape: h.bias === 'bullish' ? 'arrowUp' : h.bias === 'bearish' ? 'arrowDown' : 'circle',
      color: h.bias === 'bullish' ? UP : h.bias === 'bearish' ? DOWN : NEUTRAL,
      text: h.short,
    }));
    plugin.setMarkers(markers);
    // hitSignature changes exactly when the detected patterns change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPatterns, hitSignature]);

  const recent = [...hits].reverse().slice(0, 6);
  const message = error && error.key === key ? error.message : '';
  const shown = legend ?? (candles && candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div>
      <div className="chart-toolbar">
        <div className="pill-tabs">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              className={`pill-tab${tf === timeframe ? ' active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        <label className="chart-toggle">
          <input type="checkbox" checked={showPatterns} onChange={(e) => setShowPatterns(e.target.checked)} />
          Show patterns
        </label>
      </div>

      {shown && (
        <div className="chart-legend">
          <span>{formatWhen(shown.time, timeframe)}</span>
          <span>O <b>{inr(shown.open)}</b></span>
          <span>H <b>{inr(shown.high)}</b></span>
          <span>L <b>{inr(shown.low)}</b></span>
          <span>C <b className={shown.close >= shown.open ? 'up' : 'down'}>{inr(shown.close)}</b></span>
          {current?.stale && <span className="muted">Data may be a little old</span>}
        </div>
      )}

      <div className="chart-box chart-box-tall">
        <div className="chart-surface" ref={containerRef} />
        {!current && !message && <div className="chart-overlay">Loading candles…</div>}
        {message && <div className="chart-overlay">{message}</div>}
        {current && current.candles.length === 0 && !message && (
          <div className="chart-overlay">No candles for this timeframe. The market may be closed, or Yahoo has no data yet.</div>
        )}
      </div>

      {showPatterns && recent.length > 0 && (
        <div className="pattern-list">
          <div className="pattern-title">Recent patterns</div>
          {recent.map((h) => (
            <div className="pattern-row" key={`${h.time}-${h.short}`}>
              <span className={`badge ${h.bias === 'bullish' ? 'badge-green' : h.bias === 'bearish' ? 'badge-red' : 'badge-amber'}`}>
                {h.bias}
              </span>
              <div>
                <b>{h.name}</b> <small className="muted">{formatWhen(h.time, timeframe)}</small>
                <p>{h.note}</p>
              </div>
            </div>
          ))}
          <p className="muted pattern-disclaimer">
            Patterns are hints, not advice. Practice on paper before trusting any of them.
          </p>
        </div>
      )}
    </div>
  );
}

export default CandleChart;