import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

interface PriceTick {
  s: string;
  p: number;
  t: number;
  v: number;
}

function App() {
  const [ticks, setTicks] = useState<PriceTick[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:5000');

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('priceUpdate', (data: PriceTick[]) => {
      setTicks((prev) => [...data, ...prev].slice(0, 10));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Live Price Feed</h1>
      <p>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      <ul>
        {ticks.map((tick, i) => (
          <li key={i}>
            {tick.s} — ${tick.p.toFixed(2)} — vol: {tick.v}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;