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

app.post('/api/orders', requireAuth, orderLimiter, async (req: AuthRequest, res: Response) => {
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
      data: parsed.value,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating account details:', error);
    res.status(500).json({ error: 'Something went wrong updating account details' });
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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});