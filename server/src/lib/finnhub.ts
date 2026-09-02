import WebSocket from 'ws';
import { Server } from 'socket.io';

export function connectToFinnhub(io: Server) {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    console.error('FINNHUB_API_KEY is not set — real-time prices will not work');
    return;
  }

  const finnhubSocket = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

  finnhubSocket.on('open', () => {
    console.log('Connected to Finnhub');
    finnhubSocket.send(JSON.stringify({ type: 'subscribe', symbol: 'BINANCE:BTCUSDT' }));
  });

  finnhubSocket.on('message', (data) => {
    const parsed = JSON.parse(data.toString());

    if (parsed.type === 'trade' && parsed.data) {
      io.emit('priceUpdate', parsed.data);
    }
  });

  finnhubSocket.on('error', (error) => {
    console.error('Finnhub WebSocket error:', error);
  });

  finnhubSocket.on('close', () => {
    console.log('Finnhub connection closed');
  });
}