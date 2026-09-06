import WebSocket from 'ws';
import { Server } from 'socket.io';
import prisma from './prisma';

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

  finnhubSocket.on('message', async (data) => {
  const parsed = JSON.parse(data.toString());

  if (parsed.type === 'trade' && parsed.data) {
    io.emit('priceUpdate', parsed.data);

    const latestTick = parsed.data[parsed.data.length - 1];
    if (latestTick) {
      const activeAlerts = await prisma.alert.findMany({
        where: { status: 'active' },
      });

      for (const alert of activeAlerts) {
        const price = latestTick.p;
        const target = Number(alert.triggerPrice);
        const shouldTrigger =
          (alert.condition === 'above' && price >= target) ||
          (alert.condition === 'below' && price <= target);

        if (shouldTrigger) {
          await prisma.alert.update({
            where: { id: alert.id },
            data: { status: 'triggered' },
          });
          io.emit('alertTriggered', { alertId: alert.id, price });
        }
      }
    }
  }
});

  finnhubSocket.on('error', (error) => {
    console.error('Finnhub WebSocket error:', error);
  });

  finnhubSocket.on('close', () => {
    console.log('Finnhub connection closed');
  });
}