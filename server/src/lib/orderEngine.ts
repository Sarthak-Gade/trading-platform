import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { recordTransaction } from './ledger';
import { BROKERAGE_FLAT_FEE, HttpError, roundMoney } from './trading';

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

/**
 * Fills a pending order at `fillPrice`. Used by the order route (market / marketable limit orders)
 * and by the background matcher (limit orders whose price was reached).
 *
 * Everything happens in one transaction, and the order is "claimed" (pending -> executed) first,
 * so the same order can never be filled twice, even by two callers at the same moment.
 *
 * If `onlyForUserId` is given, the order must belong to that user.
 */
export async function fillOrder(orderId: string, fillPrice: number, onlyForUserId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });

    if (!order) throw new HttpError(404, 'Order not found');
    if (onlyForUserId && order.userId !== onlyForUserId) {
      throw new HttpError(403, 'This order does not belong to you');
    }

    const userId = order.userId;

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'executed' },
    });
    if (claimed.count === 0) {
      throw new HttpError(400, 'Order is no longer pending');
    }

    const totalPrice = roundMoney(order.qty * fillPrice);
    const isPositionProduct = order.productType === 'MIS' || order.productType === 'NRML';

    // Ownership check for sells (inside the transaction, so it can't go stale)
    if (order.type === 'sell') {
      if (isPositionProduct) {
        const position = await tx.position.findFirst({
          where: { userId, instrumentId: order.instrumentId, productType: order.productType },
        });
        if (!position || position.netQty < order.qty) {
          throw new HttpError(400, 'Insufficient position quantity to sell');
        }
      } else {
        const holding = await tx.holding.findFirst({
          where: { userId, instrumentId: order.instrumentId },
        });
        if (!holding || holding.qty < order.qty) {
          throw new HttpError(400, 'Insufficient holdings to sell this quantity');
        }
      }
    }

    const createdTrade = await tx.trade.create({
      data: {
        userId,
        instrumentId: order.instrumentId,
        orderId: order.id,
        pricePerShare: fillPrice,
        sharesQty: order.qty,
        totalPrice,
        brokerage: BROKERAGE_FLAT_FEE,
      },
    });

    // Buys blocked qty x limit price at placement. If the fill price is better (lower),
    // the difference goes back to the user. Sells credit their proceeds now. Fee applies to both.
    let credit = 0;
    let creditDescription = '';
    if (order.type === 'sell') {
      credit = totalPrice;
      creditDescription = `Credited sale proceeds for SELL order on ${order.instrument.symbol} (Qty: ${order.qty})`;
    } else {
      const blockedValue = roundMoney(order.qty * Number(order.orderPrice));
      credit = roundMoney(Math.max(0, blockedValue - totalPrice));
      creditDescription = `Price improvement refund on BUY order for ${order.instrument.symbol} (Qty: ${order.qty})`;
    }

    const updatedBalance = await tx.balance.update({
      where: { userId },
      data: { availableBalance: { increment: roundMoney(credit - BROKERAGE_FLAT_FEE) } },
    });
    const finalBalance = Number(updatedBalance.availableBalance);

    if (finalBalance < 0) {
      // Throwing rolls the whole transaction back, including the trade and the claimed order
      throw new HttpError(400, 'Insufficient balance to cover brokerage');
    }

    if (credit > 0) {
      await recordTransaction(
        tx,
        userId,
        'trade_credit',
        creditDescription,
        credit,
        roundMoney(finalBalance + BROKERAGE_FLAT_FEE)
      );
    }
    await recordTransaction(
      tx,
      userId,
      'charges',
      `Brokerage charged on ${order.type.toUpperCase()} order execution for ${order.instrument.symbol}`,
      -BROKERAGE_FLAT_FEE,
      finalBalance
    );

    if (isPositionProduct) {
      const existingPosition = await tx.position.findFirst({
        where: { userId, instrumentId: order.instrumentId, productType: order.productType },
      });

      if (order.type === 'buy') {
        if (existingPosition) {
          const newNetQty = existingPosition.netQty + order.qty;
          const newAvgPrice =
            (Number(existingPosition.avgPrice) * existingPosition.netQty + totalPrice) / newNetQty;

          await tx.position.update({
            where: { id: existingPosition.id },
            data: { netQty: newNetQty, avgPrice: newAvgPrice },
          });
        } else {
          await tx.position.create({
            data: {
              userId,
              instrumentId: order.instrumentId,
              productType: order.productType,
              netQty: order.qty,
              avgPrice: fillPrice,
            },
          });
        }
      } else {
        const position = existingPosition!;
        const realizedPnl = (fillPrice - Number(position.avgPrice)) * order.qty;
        const newNetQty = position.netQty - order.qty;

        if (newNetQty === 0) {
          await tx.position.delete({ where: { id: position.id } });
        } else {
          await tx.position.update({
            where: { id: position.id },
            data: {
              netQty: newNetQty,
              realizedPnl: Number(position.realizedPnl) + realizedPnl,
            },
          });
        }
      }
    } else {
      const existingHolding = await tx.holding.findFirst({
        where: { userId, instrumentId: order.instrumentId },
      });

      if (order.type === 'buy') {
        if (existingHolding) {
          await tx.holding.update({
            where: { id: existingHolding.id },
            data: {
              qty: existingHolding.qty + order.qty,
              investedValue: Number(existingHolding.investedValue) + totalPrice,
            },
          });
        } else {
          await tx.holding.create({
            data: {
              userId,
              instrumentId: order.instrumentId,
              qty: order.qty,
              investedValue: totalPrice,
            },
          });
        }
      } else {
        const holding = existingHolding!;
        const remainingQty = holding.qty - order.qty;

        if (remainingQty === 0) {
          await tx.holding.delete({ where: { id: holding.id } });
        } else {
          const avgPricePerShare = Number(holding.investedValue) / holding.qty;
          await tx.holding.update({
            where: { id: holding.id },
            data: {
              qty: remainingQty,
              investedValue: remainingQty * avgPricePerShare,
            },
          });
        }
      }
    }

    return createdTrade;
  }, SERIALIZABLE);
}

/**
 * Cancels a pending order. Buys get the funds they blocked at placement back; sells blocked nothing.
 * If `onlyForUserId` is given, the order must belong to that user.
 */
export async function cancelOrder(orderId: string, onlyForUserId?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });

    if (!order) throw new HttpError(404, 'Order not found');
    if (onlyForUserId && order.userId !== onlyForUserId) {
      throw new HttpError(403, 'This order does not belong to you');
    }

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (claimed.count === 0) {
      throw new HttpError(400, `Order is already ${order.status}`);
    }

    if (order.type === 'buy') {
      const refund = roundMoney(order.qty * Number(order.orderPrice));
      const updatedBalance = await tx.balance.update({
        where: { userId: order.userId },
        data: { availableBalance: { increment: refund } },
      });

      await recordTransaction(
        tx,
        order.userId,
        'trade_credit',
        `Released blocked funds for cancelled BUY order on ${order.instrument.symbol} (Qty: ${order.qty})`,
        refund,
        Number(updatedBalance.availableBalance)
      );
    }

    return { id: order.id, status: 'cancelled' };
  }, SERIALIZABLE);
}
