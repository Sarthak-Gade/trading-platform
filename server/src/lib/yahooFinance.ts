import YahooFinance from 'yahoo-finance2';
import { Server } from 'socket.io';

const yahooFinance = new YahooFinance();

const POLL_INTERVAL_MS = 60000; // 60 seconds — conservative, to avoid the rate limit hit earlier

export function startYahooFinancePolling(io: Server, symbols: string[]) {
  const poll = async () => {
    for (const symbol of symbols) {
      try {
        const quote = await yahooFinance.quote(symbol);

        if (quote && quote.regularMarketPrice !== undefined) {
          io.emit('priceUpdate', [
            {
              s: symbol,
              p: quote.regularMarketPrice,
              t: Date.now(),
              v: quote.regularMarketVolume ?? 0,
            },
          ]);
          console.log(`Yahoo Finance tick: ${symbol} = ${quote.regularMarketPrice}`);
        }
      } catch (error) {
        console.error(`Error fetching Yahoo Finance quote for ${symbol}:`, error);
      }
    }
  };

  poll();
  setInterval(poll, POLL_INTERVAL_MS);

  console.log(`Started Yahoo Finance polling for: ${symbols.join(', ')} (every ${POLL_INTERVAL_MS / 1000}s)`);
}