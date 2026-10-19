import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { recordTransaction } from './ledger';
import { HttpError, roundMoney } from './trading';
import { calculateCharges } from './charges';

export const TRIGGER_ORDER_TYPES = ['stop_loss', 'take_profit'];
// Orders the price watcher fills when the market reaches their price (limit orders wait for their limit)
export const WATCHED_ORDER_TYPES = [...TRIGGER_ORDER_TYPES, 'limit'];

interface FillOptions {
  // Set when a user asks for the fill through the API: checks ownership and blocks trigger orders
  userId?: string;
  // The price the order fills at. Defaults to the order's own price.
  fillPrice?: number;
  // Run inside a transaction the caller already opened (used to place and fill in one step)
  tx?: Prisma.TransactionClient;
}

// Fills one pending order: trade, charges, wallet, holdings or positions, all in one transaction.
export async function fillOrder(orderId: string, opts: FillOptions = {}) {
  const run = async (tx: Prisma.TransactionClient) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });

    if (!order) throw new HttpError(404, 'Order not found');
    if (opts.userId !== undefined) {
      if (order.userId !== opts.userId) throw new HttpError(403, 'This order does not belong to you');
      // Only the price watcher may fill these, otherwise a user could fill one by hand before its price is reached
      if (WATCHED_ORDER_TYPES.includes(order.orderType)) {
        throw new HttpError(400, 'Limit, stop-loss and take-profit orders execute on their own when the price is reached');
      }
    }
    const userId = order.userId;

    // Claim the order: only one request can flip pending -> executed,
    // so a double-click or parallel call can't execute it twice.
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'executed' },
    });
    if (claimed.count === 0) {
      throw new HttpError(400, 'Order is no longer pending');
    }

    // Orders fill at the given price (the live price for a triggered order), else at their own price
    const price = opts.fillPrice !== undefined ? roundMoney(opts.fillPrice) : Number(order.orderPrice);
    if (opts.fillPrice !== undefined) {
      await tx.order.update({ where: { id: orderId }, data: { orderPrice: price, triggeredAt: new Date() } });
    }

    const totalPrice = roundMoney(order.qty * price);
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

    // Charges for this trade at the price it actually fills at
    const charges = calculateCharges({
      direction: order.type === 'sell' ? 'sell' : 'buy',
      quantity: order.qty,
      price,
      productType: order.productType,
    });

    const createdTrade = await tx.trade.create({
      data: {
        userId,
        instrumentId: order.instrumentId,
        orderId: order.id,
        pricePerShare: price,
        sharesQty: order.qty,
        totalPrice,
        brokerage: charges.brokerage,
        stt: charges.stt,
        exchangeCharges: charges.exchangeCharges,
        sebiCharges: charges.sebiCharges,
        gst: charges.gst,
        stampDuty: charges.stampDuty,
      },
    });

    // A buy blocked its money at its own price. If it fills for less, the difference goes back.
    const refund = order.type === 'buy' ? roundMoney(order.qty * Number(order.orderPrice) - totalPrice) : 0;

    // Buys were already paid at placement; sells credit proceeds now. Charges apply to both.
    const delta = roundMoney((order.type === 'sell' ? totalPrice : 0) + refund - charges.totalCharges);
    const updatedBalance = await tx.balance.update({
      where: { userId },
      data: { availableBalance: { increment: delta } },
    });
    const finalBalance = Number(updatedBalance.availableBalance);

    if (finalBalance < 0) {
      // Throwing rolls the whole transaction back, including the trade and the claimed order
      throw new HttpError(400, 'Insufficient balance to cover charges');
    }

    if (order.type === 'sell') {
      await recordTransaction(
        tx,
        userId,
        'trade_credit',
        `Credited sale proceeds for SELL order on ${order.instrument.symbol} (Qty: ${order.qty})`,
        totalPrice,
        roundMoney(finalBalance + charges.totalCharges)
      );
    }
    if (refund > 0) {
      await recordTransaction(
        tx,
        userId,
        'trade_credit',
        `Refunded ${refund.toFixed(2)} because BUY ${order.instrument.symbol} x${order.qty} filled below its limit price`,
        refund,
        roundMoney(finalBalance + charges.totalCharges)
      );
    }
    await recordTransaction(
      tx,
      userId,
      'charges',
      `Charges on ${order.type.toUpperCase()} ${order.instrument.symbol} x${order.qty}: ` +
        `brokerage ${charges.brokerage.toFixed(2)}, STT ${charges.stt.toFixed(2)}, ` +
        `exchange ${charges.exchangeCharges.toFixed(2)}, SEBI ${charges.sebiCharges.toFixed(2)}, ` +
        `GST ${charges.gst.toFixed(2)}, stamp duty ${charges.stampDuty.toFixed(2)}`,
      -charges.totalCharges,
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
              avgPrice: price,
            },
          });
        }
      } else {
        const position = existingPosition!;
        const realizedPnl = (price - Number(position.avgPrice)) * order.qty;
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
  };

  if (opts.tx) return run(opts.tx);
  return prisma.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}