import prisma from './prisma';
import { getQuote } from './quotes';
import { fillOrder, WATCHED_ORDER_TYPES } from './fillOrder';
import { HttpError, marketIsOpen } from './trading';

const CHECK_EVERY_MS = 10_000;

// Whether the market price has reached the level that fires an order:
//   limit buy fires at or below its limit, limit sell at or above it
//   stop-loss sell fires at or below its trigger, take-profit sell at or above it
export function shouldTrigger(orderType: string, side: string, price: number, level: number): boolean {
  if (orderType === 'limit') return side === 'buy' ? price <= level : price >= level;
  if (orderType === 'stop_loss') return price <= level;
  if (orderType === 'take_profit') return price >= level;
  return false;
}

let busy = false;

// One pass: look at every pending limit, stop-loss and take-profit order and fill the ones whose price was reached
export async function checkPendingOrders(): Promise<number> {
  if (busy) return 0; // the last pass is still running
  busy = true;
  let fired = 0;

  try {
    const orders = await prisma.order.findMany({
      where: { status: 'pending', orderType: { in: WATCHED_ORDER_TYPES } },
      include: { instrument: true },
    });
    if (orders.length === 0) return 0;

    // One price lookup per stock, however many orders watch it
    const prices = new Map<string, { price: number; open: boolean } | null>();
    for (const order of orders) {
      if (prices.has(order.instrumentId)) continue;
      try {
        const quote = await getQuote(order.instrument.symbol, order.instrument.exchange);
        prices.set(order.instrumentId, { price: quote.price, open: marketIsOpen(quote.marketState) });
      } catch {
        prices.set(order.instrumentId, null); // price not available, try again next pass
      }
    }

    for (const order of orders) {
      const quote = prices.get(order.instrumentId);
      // Only act on live prices, so a stale after-hours price can't fill an order
      if (!quote || !quote.open) continue;

      // Limit orders compare with their limit price, stop-loss and take-profit with their trigger
      const level = order.orderType === 'limit' ? Number(order.orderPrice) : Number(order.triggerPrice);
      if (!Number.isFinite(level)) continue;
      if (!shouldTrigger(order.orderType, order.type, quote.price, level)) continue;

      try {
        // Fills at the market price: at the limit or better for a limit order
        await fillOrder(order.id, { fillPrice: quote.price });
        fired++;
        console.log(
          `[orders] ${order.orderType} filled: ${order.type.toUpperCase()} ${order.qty} ${order.instrument.symbol} at ${quote.price} (level ${level})`
        );
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) {
          // The order can never fill (for example the shares are gone), so close it instead of retrying forever.
          // A buy gives its blocked money back in the same step.
          await closeOrder(order.id, error.message);
          console.warn(`[orders] ${order.orderType} ${order.id} cancelled: ${error.message}`);
        } else {
          // A busy database or a temporary error: leave it pending and try again next pass
          console.error(`[orders] could not fill ${order.id}, will retry:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[orders] price check failed:', error);
  } finally {
    busy = false;
  }
  return fired;
}

// Cancels a pending order and, for a buy, releases the money it had blocked
async function closeOrder(orderId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { instrument: true } });
    if (!order) return;
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'cancelled', note: reason },
    });
    if (claimed.count === 0 || order.type !== 'buy') return;

    const refund = Math.round(order.qty * Number(order.orderPrice) * 100) / 100;
    const updated = await tx.balance.update({
      where: { userId: order.userId },
      data: { availableBalance: { increment: refund } },
    });
    await tx.transaction.create({
      data: {
        userId: order.userId,
        type: 'trade_credit',
        description: `Released blocked funds for cancelled BUY order on ${order.instrument.symbol} (Qty: ${order.qty})`,
        amount: refund,
        runningBalance: updated.availableBalance,
      },
    });
  });
}

export function startOrderEngine() {
  setInterval(() => {
    void checkPendingOrders();
  }, CHECK_EVERY_MS);
  console.log(`[orders] watching limit, stop-loss and take-profit orders every ${CHECK_EVERY_MS / 1000}s`);
}