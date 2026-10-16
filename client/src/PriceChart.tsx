import { useEffect, useRef } from 'react';
import { AreaSeries, ColorType, createChart, LineStyle } from 'lightweight-charts';
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Quote } from './types';

interface Props {
  instrumentId: string;
  quote: Quote | null;
}

const UP = '#10b981';
const DOWN = '#ef4444';

// Builds a live chart from the quotes the dashboard already polls, so chart, header and ticket
// always show the same price.
function PriceChart({ instrumentId, quote }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const lastTimeRef = useRef(0);
  const closeLineRef = useRef<IPriceLine | null>(null);

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
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: true },
      crosshair: { vertLine: { color: '#374151' }, horzLine: { color: '#374151' } },
    });

    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: UP,
      topColor: 'rgba(16,185,129,0.28)',
      bottomColor: 'rgba(16,185,129,0)',
      lineWidth: 2,
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      closeLineRef.current = null;
    };
  }, []);

  // Switching stock starts a fresh line
  useEffect(() => {
    seriesRef.current?.setData([]);
    lastTimeRef.current = 0;
    if (closeLineRef.current) {
      seriesRef.current?.removePriceLine(closeLineRef.current);
      closeLineRef.current = null;
    }
  }, [instrumentId]);

  // Each new quote adds a point
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !quote) return;

    const up = quote.change === null || quote.change >= 0;
    const color = up ? UP : DOWN;
    series.applyOptions({
      lineColor: color,
      topColor: up ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)',
      bottomColor: up ? 'rgba(16,185,129,0)' : 'rgba(239,68,68,0)',
    });

    // Times must strictly increase
    const now = Math.floor(Date.now() / 1000);
    const time = Math.max(now, lastTimeRef.current + 1);
    lastTimeRef.current = time;
    series.update({ time: time as UTCTimestamp, value: quote.price });

    // Dashed line at yesterday's close
    if (quote.previousClose !== null) {
      if (closeLineRef.current) series.removePriceLine(closeLineRef.current);
      closeLineRef.current = series.createPriceLine({
        price: quote.previousClose,
        color: '#6b7280',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Prev close',
      });
    }

    chartRef.current?.timeScale().scrollToRealTime();
  }, [quote]);

  return (
    <div className="chart-box">
      <div className="chart-surface" ref={containerRef} />
      {!quote && <div className="chart-overlay">Waiting for the live price…</div>}
    </div>
  );
}

export default PriceChart;
