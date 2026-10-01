import prisma from './prisma';
import { getQuote } from './quotes';
import { cancelOrder, fillOrder } from './orderEngine';
import { HttpError, roundMoney } from './trading';

const MATCH_INTERVAL_MS = 10000;

// Set REQUIRE_MARKET_OPEN=true in .env to only fill limit orders while the exchange is in its
// regular session. Off by default so the simulator can be tested outside market hours.
const REQUIRE_MARKET_OPEN = process.env.REQUIRE_MARKET_OPEN === 'true';

let running = false;

async function matchPendingOrders() {
  // Never let two passes overlap (a slow quote could make one run past the next tick)
  if (running) return;
  running = true;

  try {
    const pending = await prisma.order.findMany({
      where: { status: 'pending', orderType: 'limit' },
      include: { instrument: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    if (pending.length === 0) return;
    console.log(`Order matcher: checking ${pending.length} pending limit order(s)`);

    // One quote lookup per stock, however many orders wait on it
    const byInstrument = new Map<string, typeof pending>();
    for (const order of pending) {
      const list = byInstrument.get(order.instrumentId) ?? [];
      list.push(order);
      byInstrument.set(order.instrumentId, list);
    }

    for (const orders of byInstrument.values()) {
      const first = orders[0];
      if (!first) continue;

      let ltp: number;
      try {
        const quote = await getQuote(first.instrument.symbol, first.instrument.exchange);
        if (REQUIRE_MARKET_OPEN && quote.marketState !== 'REGULAR') continue;
        ltp = roundMoney(quote.price);
      } catch {
        continue; // no price right now; try again on the next pass
      }

      for (const order of orders) {
        const limit = Number(order.orderPrice);
        const priceReached = order.type === 'buy' ? ltp <= limit : ltp >= limit;
        if (!priceReached) continue;

        try {
          await fillOrder(order.id, ltp);
          console.log(
            `Order matcher: filled ${order.type.toUpperCase()} ${order.qty} ${order.instrument.symbol} at ₹${ltp} (limit ₹${limit})`
          );
        } catch (error) {
          if (error instanceof HttpError && error.status === 400) {
            // The order can no longer be filled (e.g. shares were sold elsewhere, or not enough cash
            // for brokerage). Reject it so it doesn't retry forever; a buy gets its funds back.
            try {
              await cancelOrder(order.id);
              console.log(`Order matcher: cancelled order ${order.id} — ${error.message}`);
            } catch (cancelError) {
              console.error(`Order matcher: could not cancel order ${order.id}:`, cancelError);
            }
          } else {
            console.error(`Order matcher: error filling order ${order.id}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Order matcher error:', error);
  } finally {
    running = false;
  }
}

export function startOrderMatcher() {
  setInterval(matchPendingOrders, MATCH_INTERVAL_MS);
  console.log(
    `Order matcher started (every ${MATCH_INTERVAL_MS / 1000}s${REQUIRE_MARKET_OPEN ? ', market hours only' : ''})`
  );
}
