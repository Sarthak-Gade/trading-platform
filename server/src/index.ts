import express, { NextFunction, Request, Response } from 'express';
import prisma from './lib/prisma';
import { requireAuth, requireAdmin, AuthRequest } from './middleware/auth';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectToFinnhub } from './lib/finnhub';
import cors from 'cors';
import { startNSEPolling } from './lib/nseIndia';
import { startYahooFinancePolling } from './lib/yahooFinance';
import { recordTransaction } from './lib/ledger';
import { Prisma } from '@prisma/client';
import { HttpError, marketIsOpen, roundMoney, sendError, validateOrderInput } from './lib/trading';
import { fillOrder, TRIGGER_ORDER_TYPES } from './lib/fillOrder';
import { startOrderEngine } from './lib/orderEngine';
import { calculateCharges } from './lib/charges';
import { getQuote } from './lib/quotes';
import {
  validateAmount, validateAlert, validateWatchlistName,
  validateInstrumentId, validateAccountCreate, validateAccountPatch, validateBank,
} from './lib/validate';
import { generalLimiter, orderLimiter, moneyLimiter } from './middleware/rateLimit';
import { securityHeaders } from './middleware/security';
import authRouter from './routes/auth';
import { requireKyc } from './middleware/kyc';
import kycDocumentsRouter from './routes/kycDocuments';
import { KYC_DOC_LABELS, missingRequiredDocs } from './lib/kycDocuments';
import { buildContractNote, contractNoteNumber } from './lib/contractNote';
import {istDateString,istDayRange,loadContractNoteData,sendContractNotesForDate,startContractNoteMailer} from './lib/contractNoteService';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add it to server/.env before starting the server.');
  process.exit(1);
}

const app = express();

// Set TRUST_PROXY=1 when the server runs behind a proxy or load balancer, so rate limits see the
// real client IP instead of the proxy's.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// CLIENT_ORIGIN can hold one or more comma-separated origins. Without it every origin is allowed,
// which is fine for local development.
const allowedOrigins = process.env.CLIENT_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins && allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined));
const PORT = process.env.PORT || 5000;

app.use(securityHeaders);
app.use(express.json({ limit: '10kb' }));
app.use('/api', generalLimiter);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Trading platform server is running' });
});

app.get('/api/me/balance', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.userId as string;

  const balance = await prisma.balance.findUnique({ where: { userId } });

  if (!balance) {
    return res.status(404).json({ error: 'Balance not found' });
  }

  res.json(balance);
});


app.get('/api/admin/stats', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalOrders = await prisma.order.count();
    const totalTrades = await prisma.trade.count();
    const pendingOrders = await prisma.order.count({ where: { status: 'pending' } });
    const executedOrders = await prisma.order.count({ where: { status: 'executed' } });

    const tradeVolume = await prisma.trade.aggregate({
      _sum: { totalPrice: true },
    });

    const recentTrades = await prisma.trade.findMany({
      take: 10,
      orderBy: { executedAt: 'desc' },
      include: {
        user: { select: { email: true, fullName: true } },
        instrument: { select: { symbol: true } },
      },
    });

    res.json({
      totalUsers,
      totalOrders,
      totalTrades,
      pendingOrders,
      executedOrders,
      totalTradeVolume: tradeVolume._sum.totalPrice ?? 0,
      recentTrades,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Something went wrong fetching admin stats' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api', kycDocumentsRouter);

app.get('/api/me/holdings', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const holdings = await prisma.holding.findMany({
      where: { userId },
      include: { instrument: true },
    });

    res.json(holdings);
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ error: 'Something went wrong fetching holdings' });
  }
});

app.post('/api/alerts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateAlert(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { instrumentId, triggerPrice, condition } = parsed.value;

    const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    const alert = await prisma.alert.create({
      data: { userId, instrumentId, triggerPrice, condition },
    });

    res.status(201).json(alert);
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Something went wrong creating the alert' });
  }
});

app.get('/api/me/alerts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const alerts = await prisma.alert.findMany({
      where: { userId },
      include: { instrument: true },
    });

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Something went wrong fetching alerts' });
  }
});

app.delete('/api/alerts/:alertId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawAlertId = req.params.alertId;

    if (!rawAlertId || Array.isArray(rawAlertId)) {
      return res.status(400).json({ error: 'Alert ID is required' });
    }

    const alert = await prisma.alert.findUnique({ where: { id: rawAlertId } });

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    if (alert.userId !== userId) {
      return res.status(403).json({ error: 'This alert does not belong to you' });
    }

    await prisma.alert.delete({ where: { id: rawAlertId } });

    res.json({ message: 'Alert deleted' });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Something went wrong deleting the alert' });
  }
});

app.get('/api/me/positions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const positions = await prisma.position.findMany({
      where: { userId },
      include: { instrument: true },
    });

    res.json(positions);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Something went wrong fetching positions' });
  }
});

app.get('/api/me/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const orders = await prisma.order.findMany({
      where: { userId },
      include: { instrument: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Something went wrong fetching orders' });
  }
});

app.get('/api/me/trades', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const trades = await prisma.trade.findMany({
      where: { userId },
      include: { instrument: true },
      orderBy: { executedAt: 'desc' },
    });

    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Something went wrong fetching trades' });
  }
});

app.post('/api/orders', requireAuth, orderLimiter, requireKyc, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const parsed = validateOrderInput(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { instrumentId, type, orderType, productType, qty, orderPrice: requestedPrice, triggerPrice, validity } = parsed.value;
    const isTrigger = TRIGGER_ORDER_TYPES.includes(orderType);

    // Market orders are priced by the server from the live quote, never from what the client sends.
    // The quote lookup is done before the database transaction so a slow quote can't hold it open.
    const quoteInstrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!quoteInstrument) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    let orderPrice: number;
    // Set when a limit order's price is already reached at placement: it then fills right away at this price
    let limitFillPrice: number | null = null;

    if (orderType === 'market') {
      const quote = await getQuote(quoteInstrument.symbol, quoteInstrument.exchange);
      // Orders execute only while the market is open. A limit order can still be placed and waits for the open.
      if (!marketIsOpen(quote.marketState)) {
        return res.status(400).json({
          error: 'The market is closed, so a market order cannot execute now. Place a limit order instead; it will wait until the market opens.',
        });
      }
      orderPrice = roundMoney(quote.price);
    } else if (isTrigger) {
      const quote = await getQuote(quoteInstrument.symbol, quoteInstrument.exchange);
      const livePrice = roundMoney(quote.price);

      // A trigger already on the wrong side of the price would fire the moment it is placed
      if (orderType === 'stop_loss' && triggerPrice !== null && triggerPrice >= livePrice) {
        return res.status(400).json({ error: `Stop-loss trigger must be below the current price (₹${livePrice.toFixed(2)})` });
      }
      if (orderType === 'take_profit' && triggerPrice !== null && triggerPrice <= livePrice) {
        return res.status(400).json({ error: `Take-profit trigger must be above the current price (₹${livePrice.toFixed(2)})` });
      }
      orderPrice = triggerPrice as number; // shown as the order price until it fires; the fill price replaces it
    } else {
      // validateOrderInput guarantees limit orders carry a price
      orderPrice = requestedPrice as number;

      // A limit order waits for the market to reach its price. If the price is already there
      // (and the market is open) it fills now, at the market price, which is the limit or better.
      try {
        const quote = await getQuote(quoteInstrument.symbol, quoteInstrument.exchange);
        const reached = type === 'buy' ? quote.price <= orderPrice : quote.price >= orderPrice;
        if (reached && marketIsOpen(quote.marketState)) limitFillPrice = roundMoney(quote.price);
      } catch {
        // No live price right now: the order is simply placed and the price watcher will handle it
      }
    }

    // Charges are taken when the order fills, so a buy must have room for them on top of its value
    const estimatedCharges = calculateCharges({ direction: type, quantity: qty, price: orderPrice, productType });

    const result = await prisma.$transaction(
      async (tx) => {
        const instrument = await tx.instrument.findUnique({ where: { id: instrumentId } });
        if (!instrument) {
          throw new HttpError(404, 'Instrument not found');
        }

        if (type === 'buy') {
          const orderValue = roundMoney(qty * orderPrice);

          // Atomic check-and-block: the WHERE clause fails if funds are short,
          // so two parallel orders can never spend the same money.
          // We require room for the charges too, which are taken at execution.
          const blocked = await tx.balance.updateMany({
            where: { userId, availableBalance: { gte: roundMoney(orderValue + estimatedCharges.totalCharges) } },
            data: { availableBalance: { decrement: orderValue } },
          });
          if (blocked.count === 0) {
            throw new HttpError(400, 'Insufficient balance to place this order');
          }

          const updatedBalance = await tx.balance.findUniqueOrThrow({ where: { userId } });
          await recordTransaction(
            tx,
            userId,
            'trade_debit',
            `Blocked funds for BUY ${orderType.toUpperCase()} order on ${instrument.symbol} (Qty: ${qty})`,
            -orderValue,
            Number(updatedBalance.availableBalance)
          );
        } else {
          // Sell: make sure the shares are owned and not already promised to other pending sells
          const pendingSellAgg = await tx.order.aggregate({
            where: { userId, instrumentId, type: 'sell', status: 'pending', productType },
            _sum: { qty: true },
          });
          const alreadyReserved = pendingSellAgg._sum.qty ?? 0;

          let ownedQty = 0;
          if (productType === 'MIS' || productType === 'NRML') {
            const position = await tx.position.findFirst({ where: { userId, instrumentId, productType } });
            ownedQty = position?.netQty ?? 0;
          } else {
            const holding = await tx.holding.findFirst({ where: { userId, instrumentId } });
            ownedQty = holding?.qty ?? 0;
          }

          const availableToSell = ownedQty - alreadyReserved;
          if (availableToSell < qty) {
            throw new HttpError(
              400,
              `Insufficient quantity available to sell. You have ${availableToSell} unreserved (after accounting for other pending sell orders).`
            );
          }
        }

        const created = await tx.order.create({
          data: {
            userId, instrumentId, type, orderType, productType, qty, orderPrice, status: 'pending',
            // Stop-loss and take-profit stay until they fire or are cancelled
            validity: isTrigger ? 'GTC' : validity,
            ...(isTrigger ? { triggerPrice } : {}),
          },
        });

        // Stop-loss, take-profit and limit orders whose price is not reached yet wait for the price watcher
        if (isTrigger || (orderType === 'limit' && limitFillPrice === null)) {
          return { order: created, trade: null };
        }

        // Market orders, and limit orders already at their price, fill now in this same transaction:
        // if the fill fails, the order and the blocked funds are rolled back together
        const trade = await fillOrder(created.id, { tx, ...(limitFillPrice !== null ? { fillPrice: limitFillPrice } : {}) });
        return { order: { ...created, status: 'executed' }, trade };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    res.status(201).json({ ...result.order, trade: result.trade });
  } catch (error) {
    sendError(res, error, 'placing the order');
  }
});
app.post('/api/orders/:orderId/execute', requireAuth, orderLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawOrderId = req.params.orderId;

    if (!rawOrderId || Array.isArray(rawOrderId)) {
      return res.status(400).json({ error: 'Order ID is required' });
    }
    const orderId: string = rawOrderId;

    const trade = await fillOrder(orderId, { userId });

    res.status(201).json({ message: 'Order executed successfully', trade });
  } catch (error) {
    sendError(res, error, 'executing the order');
  }
});

app.post('/api/orders/:orderId/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawOrderId = req.params.orderId;

    if (!rawOrderId || Array.isArray(rawOrderId)) {
      return res.status(400).json({ error: 'Order ID is required' });
    }
    const orderId: string = rawOrderId;

    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: { instrument: true },
        });

        if (!order) throw new HttpError(404, 'Order not found');
        if (order.userId !== userId) throw new HttpError(403, 'This order does not belong to you');

        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: 'pending' },
          data: { status: 'cancelled' },
        });
        if (claimed.count === 0) {
          throw new HttpError(400, `Order is already ${order.status}`);
        }

        // Buys blocked cash at placement, so give it back. Sells never blocked cash.
        if (order.type === 'buy') {
          const refund = roundMoney(order.qty * Number(order.orderPrice));
          const updatedBalance = await tx.balance.update({
            where: { userId },
            data: { availableBalance: { increment: refund } },
          });

          await recordTransaction(
            tx,
            userId,
            'trade_credit',
            `Released blocked funds for cancelled BUY order on ${order.instrument.symbol} (Qty: ${order.qty})`,
            refund,
            Number(updatedBalance.availableBalance)
          );
        }

        return { id: order.id, status: 'cancelled' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    res.json({ message: 'Order cancelled', order: result });
  } catch (error) {
    sendError(res, error, 'cancelling the order');
  }
});

app.post('/api/watchlists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateWatchlistName(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const watchlist = await prisma.watchlist.create({
      data: { userId, name: parsed.value },
    });

    res.status(201).json(watchlist);
  } catch (error) {
    console.error('Error creating watchlist:', error);
    res.status(500).json({ error: 'Something went wrong creating the watchlist' });
  }
});

app.get('/api/me/watchlists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
    });

    res.json(watchlists);
  } catch (error) {
    console.error('Error fetching watchlists:', error);
    res.status(500).json({ error: 'Something went wrong fetching watchlists' });
  }
});

app.delete('/api/watchlists/:watchlistId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawId = req.params.watchlistId;

    if (!rawId || Array.isArray(rawId)) {
      return res.status(400).json({ error: 'Watchlist ID is required' });
    }

    const watchlist = await prisma.watchlist.findUnique({ where: { id: rawId } });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'This watchlist does not belong to you' });
    }

    await prisma.watchlist.delete({ where: { id: rawId } });

    res.json({ message: 'Watchlist deleted' });
  } catch (error) {
    console.error('Error deleting watchlist:', error);
    res.status(500).json({ error: 'Something went wrong deleting the watchlist' });
  }
});

app.post('/api/watchlists/:watchlistId/items', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawWatchlistId = req.params.watchlistId;
    const parsedInstrument = validateInstrumentId(req.body);
    if (!parsedInstrument.ok) {
      return res.status(400).json({ error: parsedInstrument.error });
    }
    const instrumentId = parsedInstrument.value;

    if (!rawWatchlistId || Array.isArray(rawWatchlistId)) {
      return res.status(400).json({ error: 'Watchlist ID is required' });
    }

    const watchlist = await prisma.watchlist.findUnique({ where: { id: rawWatchlistId } });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'This watchlist does not belong to you' });
    }

    const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });

    if (!instrument) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    const item = await prisma.watchlistItem.create({
      data: { watchlistId: rawWatchlistId, instrumentId },
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Error adding watchlist item:', error);
    res.status(500).json({ error: 'Something went wrong adding to the watchlist' });
  }
});

app.get('/api/watchlists/:watchlistId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawWatchlistId = req.params.watchlistId;

    if (!rawWatchlistId || Array.isArray(rawWatchlistId)) {
      return res.status(400).json({ error: 'Watchlist ID is required' });
    }

    const watchlist = await prisma.watchlist.findUnique({
      where: { id: rawWatchlistId },
      include: { items: { include: { instrument: true } } },
    });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'This watchlist does not belong to you' });
    }

    res.json(watchlist);
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    res.status(500).json({ error: 'Something went wrong fetching the watchlist' });
  }
});

app.delete('/api/watchlists/:watchlistId/items/:itemId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawWatchlistId = req.params.watchlistId;
    const rawItemId = req.params.itemId;

    if (!rawWatchlistId || Array.isArray(rawWatchlistId) || !rawItemId || Array.isArray(rawItemId)) {
      return res.status(400).json({ error: 'Watchlist ID and Item ID are required' });
    }

    const watchlist = await prisma.watchlist.findUnique({ where: { id: rawWatchlistId } });

    if (!watchlist) {
      return res.status(404).json({ error: 'Watchlist not found' });
    }

    if (watchlist.userId !== userId) {
      return res.status(403).json({ error: 'This watchlist does not belong to you' });
    }

    await prisma.watchlistItem.delete({ where: { id: rawItemId } });

    res.json({ message: 'Item removed from watchlist' });
  } catch (error) {
    console.error('Error removing watchlist item:', error);
    res.status(500).json({ error: 'Something went wrong removing the item' });
  }
});

app.post('/api/me/account', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateAccountCreate(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { dob, pan_no, gender, maritalStatus, occupation, incomeRange } = parsed.value;

    const existing = await prisma.account.findUnique({ where: { userId } });
    if (existing) {
      return res.status(409).json({ error: 'Account details already exist for this user' });
    }

    const uniqueClientCode = `UCC${Date.now()}`;

    const account = await prisma.account.create({
      data: {
        userId,
        dob,
        pan_no,
        gender,
        maritalStatus,
        occupation,
        incomeRange,
        uniqueClientCode,
      },
    });

    res.status(201).json(account);
  } catch (error) {
    // pan_no is unique: someone else already registered this PAN
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'This PAN is already registered with another account' });
    }
    console.error('Error creating account details:', error);
    res.status(500).json({ error: 'Something went wrong saving account details' });
  }
});

app.get('/api/me/account', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const account = await prisma.account.findUnique({ where: { userId } });

    if (!account) {
      return res.status(404).json({ error: 'Account details not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Error fetching account details:', error);
    res.status(500).json({ error: 'Something went wrong fetching account details' });
  }
});

app.patch('/api/me/account', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateAccountPatch(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const existing = await prisma.account.findUnique({ where: { userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Account details not found. Create them first.' });
    }

    const updated = await prisma.account.update({
    where: { userId },
    data: existing.kycStatus === 'rejected'
        ? { ...parsed.value, kycStatus: 'pending', kycNote: null }
        : parsed.value,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating account details:', error);
    res.status(500).json({ error: 'Something went wrong updating account details' });
  }
});

// ---------- KYC review (admin) ----------
app.get('/api/admin/kyc', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      throw new HttpError(400, 'status must be pending, verified or rejected');
    }
    const accounts = await prisma.account.findMany({
      where: { kycStatus: status },
      orderBy: { user: { createdAt: 'desc' } },
      include: { user: { select: { id: true, fullName: true, email: true, mobNumber: true } } },
    });
    res.json(accounts);
  } catch (error) {
    sendError(res, error, 'fetching KYC submissions');
  }
});

app.post('/api/admin/kyc/:userId/review', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rawUserId = req.params.userId;
    if (!rawUserId || Array.isArray(rawUserId)) throw new HttpError(400, 'User ID is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const decision = body.decision;
    if (decision !== 'verified' && decision !== 'rejected') {
      throw new HttpError(400, 'decision must be "verified" or "rejected"');
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    if (decision === 'rejected' && !note) throw new HttpError(400, 'Give a reason when rejecting a KYC');

    // A KYC can only be approved once the required documents have been uploaded
    if (decision === 'verified') {
      const missing = await missingRequiredDocs(rawUserId);
      if (missing.length > 0) {
        throw new HttpError(400, `Cannot approve yet: ${missing.map((t) => KYC_DOC_LABELS[t]).join(' and ')} not uploaded`);
      }
    }

    const result = await prisma.account.updateMany({
      where: { userId: rawUserId },
      data: { kycStatus: decision, kycNote: note || null, kycReviewedAt: new Date() },
    });
    if (result.count === 0) throw new HttpError(404, 'No KYC profile found for this user');

    res.json({ message: `KYC ${decision}` });
  } catch (error) {
    sendError(res, error, 'reviewing the KYC');
  }
});

app.post('/api/me/banks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateBank(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { accountNumber, ifscCode, bankBranch } = parsed.value;

    const existingBanks = await prisma.bank.count({ where: { userId } });
    if (existingBanks >= 5) {
      return res.status(400).json({ error: 'You can link at most 5 bank accounts' });
    }

    const bank = await prisma.bank.create({
      data: { userId, accountNumber, ifscCode, bankBranch, status: 'pending' },
    });

    res.status(201).json(bank);
  } catch (error) {
    console.error('Error adding bank account:', error);
    res.status(500).json({ error: 'Something went wrong adding the bank account' });
  }
});

app.get('/api/me/banks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const banks = await prisma.bank.findMany({ where: { userId } });

    res.json(banks);
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Something went wrong fetching bank accounts' });
  }
});

app.delete('/api/me/banks/:bankId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawBankId = req.params.bankId;

    if (!rawBankId || Array.isArray(rawBankId)) {
      return res.status(400).json({ error: 'Bank ID is required' });
    }

    const bank = await prisma.bank.findUnique({ where: { id: rawBankId } });

    if (!bank) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    if (bank.userId !== userId) {
      return res.status(403).json({ error: 'This bank account does not belong to you' });
    }

    await prisma.bank.delete({ where: { id: rawBankId } });

    res.json({ message: 'Bank account removed' });
  } catch (error) {
    console.error('Error deleting bank account:', error);
    res.status(500).json({ error: 'Something went wrong deleting the bank account' });
  }
});

app.get('/api/instruments/search', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const query = req.query.q;

    if (!query || typeof query !== 'string' || query.trim().length < 1) {
      return res.json([]);
    }

    const results = await prisma.instrument.findMany({
      where: {
        OR: [
          { symbol: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 15,
    });

    res.json(results);
  } catch (error) {
    console.error('Error searching instruments:', error);
    res.status(500).json({ error: 'Something went wrong searching instruments' });
  }
});

app.get('/api/charges/estimate', requireAuth, (req: AuthRequest, res: Response) => {
  const direction = req.query.direction;
  const productType = typeof req.query.productType === 'string' ? req.query.productType : 'CNC';
  const quantity = Number(req.query.quantity);
  const price = Number(req.query.price);

  if (direction !== 'buy' && direction !== 'sell') {
    return res.status(400).json({ error: 'direction must be "buy" or "sell"' });
  }
  if (!['CNC', 'MIS', 'NRML'].includes(productType)) {
    return res.status(400).json({ error: 'productType must be one of: CNC, MIS, NRML' });
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 100000) {
    return res.status(400).json({ error: 'quantity must be a whole number between 1 and 100000' });
  }
  if (!Number.isFinite(price) || price <= 0 || price > 10000000) {
    return res.status(400).json({ error: 'price must be a positive number' });
  }

  res.json(calculateCharges({ direction, quantity, price, productType }));
});

app.get('/api/instruments/:instrumentId/quote', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawInstrumentId = req.params.instrumentId;

    if (!rawInstrumentId || Array.isArray(rawInstrumentId)) {
      return res.status(400).json({ error: 'Instrument ID is required' });
    }

    const instrument = await prisma.instrument.findUnique({ where: { id: rawInstrumentId } });
    if (!instrument) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    const quote = await getQuote(instrument.symbol, instrument.exchange);
    res.json(quote);
  } catch (error) {
    sendError(res, error, 'fetching the quote');
  }
});

app.post('/api/me/deposit', requireAuth, moneyLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateAmount(req.body, 'Deposit');
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const amount = parsed.value;

    const result = await prisma.$transaction(async (tx) => {
      // increment is applied by the database itself, so two deposits at once can't overwrite each other
      const updated = await tx.balance.update({
        where: { userId },
        data: { availableBalance: { increment: amount } },
      });

      await recordTransaction(
        tx, userId, 'deposit', `Deposit of ₹${amount}`, amount, Number(updated.availableBalance)
      );

      return updated;
    });

    res.status(201).json(result);
  } catch (error) {
    sendError(res, error, 'processing the deposit');
  }
});

app.post('/api/me/withdraw', requireAuth, moneyLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const parsed = validateAmount(req.body, 'Withdrawal');
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const amount = parsed.value;

    const result = await prisma.$transaction(async (tx) => {
      // The balance check and the deduction are one statement, so two withdrawals at once
      // can never take the balance below zero.
      const deducted = await tx.balance.updateMany({
        where: { userId, availableBalance: { gte: amount } },
        data: { availableBalance: { decrement: amount } },
      });
      if (deducted.count === 0) {
        throw new HttpError(400, 'Insufficient balance for this withdrawal');
      }

      const updated = await tx.balance.findUniqueOrThrow({ where: { userId } });

      await recordTransaction(
        tx, userId, 'withdrawal', `Withdrawal of ₹${amount}`, -amount, Number(updated.availableBalance)
      );

      return updated;
    });

    res.status(201).json(result);
  } catch (error) {
    sendError(res, error, 'processing the withdrawal');
  }
});

app.get('/api/me/transactions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Something went wrong fetching transactions' });
  }
});

// ---------- Trading Journal ----------
// ---------- Trading Journal ----------
const JOURNAL_TEXT_FIELDS = ['strategy', 'entryReason', 'exitReason', 'notes', 'learnings'] as const;

// undefined = field not sent; null = sent but empty; string = trimmed value
function cleanText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 2000);
  return trimmed === '' ? null : trimmed;
}

const journalInclude = {
  trade: { include: { instrument: true, order: true } },
} as const;

app.post('/api/me/journal', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const body = (req.body ?? {}) as Record<string, unknown>;

    const strategy = cleanText(body.strategy) ?? null;
    const entryReason = cleanText(body.entryReason) ?? null;
    const exitReason = cleanText(body.exitReason) ?? null;
    const notes = cleanText(body.notes) ?? null;
    const learnings = cleanText(body.learnings) ?? null;

    if ([strategy, entryReason, exitReason, notes, learnings].every((v) => v === null)) {
      return res.status(400).json({ error: 'Write at least one field' });
    }

    let tradeId: string | null = null;
    if (typeof body.tradeId === 'string' && body.tradeId !== '') {
      // Ownership check: you can only journal your own trades
      const trade = await prisma.trade.findFirst({ where: { id: body.tradeId, userId } });
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }
      tradeId = trade.id;
    }

    const entry = await prisma.journal.create({
      data: { userId, tradeId, strategy, entryReason, exitReason, notes, learnings },
      include: journalInclude,
    });

    res.status(201).json(entry);
  } catch (error) {
    sendError(res, error, 'saving the journal entry');
  }
});

app.get('/api/me/journal', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;

    const entries = await prisma.journal.findMany({
      where: { userId },
      include: journalInclude,
      orderBy: { createdAt: 'desc' },
    });

    res.json(entries);
  } catch (error) {
    sendError(res, error, 'fetching the journal');
  }
});

app.patch('/api/me/journal/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawId = req.params.id;

    if (!rawId || Array.isArray(rawId)) {
      return res.status(400).json({ error: 'Journal entry ID is required' });
    }

    const existing = await prisma.journal.findFirst({ where: { id: rawId, userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Whitelist: only the text fields. userId and tradeId can never change here.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.JournalUpdateInput = {};
    for (const f of JOURNAL_TEXT_FIELDS) {
      const v = cleanText(body[f]);
      if (v !== undefined) data[f] = v;
    }

    const updated = await prisma.journal.update({
      where: { id: rawId },
      data,
      include: journalInclude,
    });

    res.json(updated);
  } catch (error) {
    sendError(res, error, 'updating the journal entry');
  }
});

app.delete('/api/me/journal/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawId = req.params.id;

    if (!rawId || Array.isArray(rawId)) {
      return res.status(400).json({ error: 'Journal entry ID is required' });
    }

    // One query checks ownership and deletes
    const result = await prisma.journal.deleteMany({ where: { id: rawId, userId } });
    if (result.count === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ message: 'Journal entry deleted' });
  } catch (error) {
    sendError(res, error, 'deleting the journal entry');
  }
});

// ---------- IPO bidding (simulated) ----------
const IPO_RETAIL_LIMIT = 200000;        // max bid value per application, like real retail IPOs
const IPO_ALLOTMENT_PROBABILITY = 0.5;  // simulated lottery: each eligible application has this chance

type IpoPhase = 'upcoming' | 'open' | 'closed' | 'allotted';

// Status is derived from the dates; only "allotted" is stored
function ipoPhase(ipo: { status: string; openDate: Date; closeDate: Date }): IpoPhase {
  if (ipo.status === 'allotted') return 'allotted';
  const now = new Date();
  if (now < ipo.openDate) return 'upcoming';
  if (now <= ipo.closeDate) return 'open';
  return 'closed';
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Admin: create an IPO for an existing instrument
app.post('/api/admin/ipos', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const instrumentId = typeof body.instrumentId === 'string' ? body.instrumentId : '';
    const priceMin = Number(body.priceMin);
    const priceMax = Number(body.priceMax);
    const lotSize = Number(body.lotSize);
    const openDate = parseDate(body.openDate);
    const closeDate = parseDate(body.closeDate);

    if (!instrumentId) throw new HttpError(400, 'instrumentId is required');
    if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0 || priceMax < priceMin) {
      throw new HttpError(400, 'Price band is invalid: priceMax must be at least priceMin, both above 0');
    }
    if (!Number.isInteger(lotSize) || lotSize < 1 || lotSize > 10000) {
      throw new HttpError(400, 'lotSize must be a whole number between 1 and 10000');
    }
    if (!openDate || !closeDate || closeDate <= openDate) {
      throw new HttpError(400, 'Valid openDate and closeDate are required, and closeDate must be after openDate');
    }

    const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new HttpError(404, 'Instrument not found');

    const ipo = await prisma.ipo.create({
      data: { instrumentId, priceMin, priceMax, lotSize, openDate, closeDate },
      include: { instrument: true },
    });
    res.status(201).json(ipo);
  } catch (error) {
    sendError(res, error, 'creating the IPO');
  }
});

// All IPOs, each with the current user's application (if any)
app.get('/api/ipos', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const ipos = await prisma.ipo.findMany({
      orderBy: { openDate: 'desc' },
      include: { instrument: true, applications: { where: { userId } } },
    });
    res.json(
      ipos.map(({ applications, ...ipo }) => ({
        ...ipo,
        phase: ipoPhase(ipo),
        myApplication: applications[0] ?? null,
      }))
    );
  } catch (error) {
    sendError(res, error, 'fetching IPOs');
  }
});

app.get('/api/me/ipo-applications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const applications = await prisma.ipoApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { ipo: { include: { instrument: true } } },
    });
    res.json(applications);
  } catch (error) {
    sendError(res, error, 'fetching IPO applications');
  }
});

// Apply: blocks the bid amount from the balance, like a UPI mandate
app.post('/api/ipos/:ipoId/apply', requireAuth, moneyLimiter, requireKyc, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawIpoId = req.params.ipoId;
    if (!rawIpoId || Array.isArray(rawIpoId)) throw new HttpError(400, 'IPO ID is required');
    const ipoId: string = rawIpoId;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const lots = Number(body.lots);
    const bidPrice = Number(body.bidPrice);
    if (!Number.isInteger(lots) || lots < 1) throw new HttpError(400, 'lots must be a whole number, at least 1');
    if (!Number.isFinite(bidPrice) || bidPrice <= 0) throw new HttpError(400, 'bidPrice must be a positive number');

    const application = await prisma.$transaction(async (tx) => {
      const ipo = await tx.ipo.findUnique({ where: { id: ipoId }, include: { instrument: true } });
      if (!ipo) throw new HttpError(404, 'IPO not found');
      if (ipoPhase(ipo) !== 'open') throw new HttpError(400, 'This IPO is not open for bidding');

      const min = Number(ipo.priceMin);
      const max = Number(ipo.priceMax);
      if (bidPrice < min || bidPrice > max) {
        throw new HttpError(400, `Bid price must be within the price band ₹${min} to ₹${max}`);
      }

      const qty = lots * ipo.lotSize;
      const amount = roundMoney(qty * bidPrice);
      if (amount > IPO_RETAIL_LIMIT) {
        throw new HttpError(400, `Retail bids are limited to ₹${IPO_RETAIL_LIMIT.toLocaleString('en-IN')} per application`);
      }

      const existing = await tx.ipoApplication.findUnique({ where: { userId_ipoId: { userId, ipoId } } });
      if (existing) throw new HttpError(409, 'You have already applied to this IPO');

      // Atomic check-and-block, same pattern as order placement
      const blocked = await tx.balance.updateMany({
        where: { userId, availableBalance: { gte: amount } },
        data: { availableBalance: { decrement: amount } },
      });
      if (blocked.count === 0) throw new HttpError(400, 'Insufficient balance to place this bid');

      const balance = await tx.balance.findUniqueOrThrow({ where: { userId } });
      await recordTransaction(
        tx,
        userId,
        'ipo_debit',
        `Blocked funds for ${ipo.instrument.symbol} IPO bid (${lots} lot${lots > 1 ? 's' : ''}, ${qty} shares @ ₹${bidPrice})`,
        -amount,
        Number(balance.availableBalance)
      );

      return tx.ipoApplication.create({
        data: { userId, ipoId, lots, qty, bidPrice, fundsBlocked: amount },
      });
    });

    res.status(201).json(application);
  } catch (error) {
    sendError(res, error, 'submitting the IPO bid');
  }
});

// Cancel your own application while the IPO is still open: funds are released
app.post('/api/ipos/:ipoId/cancel', requireAuth, moneyLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawIpoId = req.params.ipoId;
    if (!rawIpoId || Array.isArray(rawIpoId)) throw new HttpError(400, 'IPO ID is required');
    const ipoId: string = rawIpoId;

    await prisma.$transaction(async (tx) => {
      const ipo = await tx.ipo.findUnique({ where: { id: ipoId }, include: { instrument: true } });
      if (!ipo) throw new HttpError(404, 'IPO not found');
      if (ipoPhase(ipo) !== 'open') throw new HttpError(400, 'Applications can only be cancelled while the IPO is open');

      const application = await tx.ipoApplication.findUnique({ where: { userId_ipoId: { userId, ipoId } } });
      if (!application) throw new HttpError(404, 'You have not applied to this IPO');

      // Claim the cancellation so it can only happen once
      const claimed = await tx.ipoApplication.updateMany({
        where: { id: application.id, status: 'applied' },
        data: { status: 'cancelled' },
      });
      if (claimed.count === 0) throw new HttpError(400, `Application is already ${application.status}`);

      const refund = Number(application.fundsBlocked);
      const balance = await tx.balance.update({
        where: { userId },
        data: { availableBalance: { increment: refund } },
      });
      await recordTransaction(
        tx,
        userId,
        'ipo_credit',
        `Released blocked funds for cancelled ${ipo.instrument.symbol} IPO bid`,
        refund,
        Number(balance.availableBalance)
      );
    });

    res.json({ message: 'Application cancelled and funds released' });
  } catch (error) {
    sendError(res, error, 'cancelling the IPO application');
  }
});

// Admin: run the simulated allotment. Everything happens in one transaction, so it is all-or-nothing.
app.post('/api/admin/ipos/:ipoId/allot', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rawIpoId = req.params.ipoId;
    if (!rawIpoId || Array.isArray(rawIpoId)) throw new HttpError(400, 'IPO ID is required');
    const ipoId: string = rawIpoId;

    const body = (req.body ?? {}) as Record<string, unknown>;

    const summary = await prisma.$transaction(
      async (tx) => {
        const ipo = await tx.ipo.findUnique({ where: { id: ipoId }, include: { instrument: true } });
        if (!ipo) throw new HttpError(404, 'IPO not found');

        const phase = ipoPhase(ipo);
        if (phase === 'allotted') throw new HttpError(400, 'Allotment has already been done for this IPO');
        if (phase !== 'closed') throw new HttpError(400, 'Allotment can only run after the IPO has closed');

        // The final issue price defaults to the top of the band, like a cut-off price
        const issuePrice = body.issuePrice === undefined ? Number(ipo.priceMax) : Number(body.issuePrice);
        if (!Number.isFinite(issuePrice) || issuePrice < Number(ipo.priceMin) || issuePrice > Number(ipo.priceMax)) {
          throw new HttpError(400, 'issuePrice must be inside the price band');
        }

        // Claim the allotment so two admins cannot run it twice
        const claimed = await tx.ipo.updateMany({
          where: { id: ipoId, status: 'scheduled' },
          data: { status: 'allotted', issuePrice },
        });
        if (claimed.count === 0) throw new HttpError(400, 'Allotment has already been done for this IPO');

        const applications = await tx.ipoApplication.findMany({ where: { ipoId, status: 'applied' } });
        const symbol = ipo.instrument.symbol;
        let allotted = 0;
        let notAllotted = 0;

        for (const app of applications) {
                    // Claim the application first, so a bid can never be paid out twice
          const claimedApp = await tx.ipoApplication.updateMany({
            where: { id: app.id, status: 'applied' },
            data: { status: 'allotted' },
          });
          if (claimedApp.count === 0) continue;
          const blocked = Number(app.fundsBlocked);
          // A bid below the final issue price is not eligible; otherwise it enters the lottery
          const eligible = Number(app.bidPrice) >= issuePrice;
          const wins = eligible && Math.random() < IPO_ALLOTMENT_PROBABILITY;

          if (wins) {
            const cost = roundMoney(app.qty * issuePrice);
            const refund = roundMoney(blocked - cost);

            if (refund > 0) {
              const balance = await tx.balance.update({
                where: { userId: app.userId },
                data: { availableBalance: { increment: refund } },
              });
              await recordTransaction(
                tx, app.userId, 'ipo_credit',
                `Refund of excess bid amount, ${symbol} IPO allotted at ₹${issuePrice}`,
                refund, Number(balance.availableBalance)
              );
            }

            const holding = await tx.holding.findFirst({ where: { userId: app.userId, instrumentId: ipo.instrumentId } });
            if (holding) {
              await tx.holding.update({
                where: { id: holding.id },
                data: {
                  qty: { increment: app.qty },
                  investedValue: { increment: cost },
                  currentValue: { increment: cost },
                },
              });
            } else {
              await tx.holding.create({
                data: { userId: app.userId, instrumentId: ipo.instrumentId, qty: app.qty, investedValue: cost, currentValue: cost },
              });
            }

            await tx.ipoApplication.update({ where: { id: app.id }, data: { status: 'allotted' } });
            allotted++;
          } else {
            const balance = await tx.balance.update({
              where: { userId: app.userId },
              data: { availableBalance: { increment: blocked } },
            });
            await recordTransaction(
              tx, app.userId, 'ipo_credit',
              `Refund for ${symbol} IPO bid: ${eligible ? 'not allotted in the lottery' : 'bid was below the issue price'}`,
              blocked, Number(balance.availableBalance)
            );
            await tx.ipoApplication.update({ where: { id: app.id }, data: { status: 'not_allotted' } });
            notAllotted++;
          }
        }

        return { symbol, issuePrice, applications: applications.length, allotted, notAllotted };
      },
      { timeout: 60000, maxWait: 10000 }
    );

    res.json(summary);
  } catch (error) {
    sendError(res, error, 'running the IPO allotment');
  }
});

// ---------- Daily contract notes ----------
// The days (last 12 months) on which the user traded, with a small summary for each
app.get('/api/me/contract-notes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const trades = await prisma.trade.findMany({
      where: { userId, executedAt: { gte: since } },
      select: {
        executedAt: true,
        totalPrice: true,
        brokerage: true,
        stt: true,
        exchangeCharges: true,
        sebiCharges: true,
        gst: true,
        stampDuty: true,
        order: { select: { type: true } },
      },
      orderBy: { executedAt: 'desc' },
    });

    const days = new Map<string, { date: string; trades: number; buyValue: number; sellValue: number; charges: number }>();
    for (const t of trades) {
      const date = istDateString(t.executedAt);
      const day = days.get(date) ?? { date, trades: 0, buyValue: 0, sellValue: 0, charges: 0 };
      const value = Number(t.totalPrice);
      day.trades += 1;
      if (t.order.type === 'sell') day.sellValue += value;
      else day.buyValue += value;
      day.charges += Number(t.brokerage) + Number(t.stt) + Number(t.exchangeCharges) + Number(t.sebiCharges) + Number(t.gst) + Number(t.stampDuty);
      days.set(date, day);
    }

    res.json(
      [...days.values()].map((d) => ({
        ...d,
        buyValue: roundMoney(d.buyValue),
        sellValue: roundMoney(d.sellValue),
        charges: roundMoney(d.charges),
      }))
    );
  } catch (error) {
    sendError(res, error, 'fetching contract notes');
  }
});

// One day's contract note as a PDF
app.get('/api/me/contract-notes/:date/pdf', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawDate = req.params.date;
    if (!rawDate || Array.isArray(rawDate)) throw new HttpError(400, 'Date is required');
    if (!istDayRange(rawDate)) throw new HttpError(400, 'Date must be a real day in YYYY-MM-DD format');

    const data = await loadContractNoteData(userId, rawDate);
    if (!data) throw new HttpError(404, 'You have no trades on this date');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${contractNoteNumber(data.client.clientCode, rawDate)}.pdf"`);
    const doc = buildContractNote(data);
    doc.pipe(res);
    doc.end();
  } catch (error) {
    sendError(res, error, 'creating the contract note');
  }
});

// Admin: email the contract notes for a day right now (defaults to today). resend: true sends again
// even to users who already got it, which is handy for testing.
app.post('/api/admin/contract-notes/send', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const date = typeof body.date === 'string' && body.date ? body.date : istDateString(new Date());
    if (!istDayRange(date)) throw new HttpError(400, 'date must be a real day in YYYY-MM-DD format');

    res.json(await sendContractNotesForDate(date, { resend: body.resend === true }));
  } catch (error) {
    sendError(res, error, 'sending contract notes');
  }
});

// Last resort for errors Express raises itself, such as a malformed or oversized JSON body
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const e = err as { status?: number; type?: string };
  if (e.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  console.error('Unhandled error:', err);
  res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 500).json({ error: 'Something went wrong' });
});



const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

connectToFinnhub(io);
startYahooFinancePolling(io, ['RELIANCE.NS']);
startOrderEngine();
startContractNoteMailer();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});