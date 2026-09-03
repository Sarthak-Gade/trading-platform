import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import type { ISeriesApi } from 'lightweight-charts';
import { io } from 'socket.io-client';

interface PriceTick {
  s: string;
  p: number;
  t: number;
}

function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#232632' },
        horzLines: { color: '#232632' },
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#26a69a',
      lineWidth: 2,
    });

    seriesRef.current = lineSeries;

    const socket = io('http://localhost:5000');

    socket.on('priceUpdate', (data: PriceTick[]) => {
      data.forEach((tick) => {
        seriesRef.current?.update({
          time: Math.floor(tick.t / 1000) as any,
          value: tick.p,
        });
      });
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      socket.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  return <div ref={chartContainerRef} style={{ width: '100%' }} />;
}

export default PriceChart;