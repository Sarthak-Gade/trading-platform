import express, { Request, Response } from 'express';
import prisma from './lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { requireAuth,requireAdmin, AuthRequest } from './middleware/auth';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectToFinnhub } from './lib/finnhub';
import cors from 'cors';
import { startNSEPolling } from './lib/nseIndia';
import { startYahooFinancePolling } from './lib/yahooFinance';
import { recordTransaction } from './lib/ledger';

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

app.use(express.json());

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

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, mobNumber } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        mobNumber,
        balance: {
          create: { availableBalance: 0, usedMargin: 0 },
        },
      },
    });

    res.status(201).json({ id: user.id, email: user.email, fullName: user.fullName });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Something went wrong during signup' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Something went wrong during login' });
  }
});

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
    const { instrumentId, triggerPrice, condition } = req.body;

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

app.post('/api/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const { instrumentId, type, orderType, productType, qty, orderPrice, validity } = req.body;

    const instrument = await prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    const balance = await prisma.balance.findUnique({ where: { userId } });
    if (!balance) {
      return res.status(404).json({ error: 'User balance not found' });
    }

    const orderValue = qty * orderPrice;
    const resolvedProductType = productType || 'CNC';

    if (type === 'buy') {
      if (Number(balance.availableBalance) < orderValue) {
        return res.status(400).json({ error: 'Insufficient balance to place this order' });
      }
    } else {
      // Sell: check unreserved quantity instead of blocking cash
      const pendingSellAgg = await prisma.order.aggregate({
        where: {
          userId,
          instrumentId,
          type: 'sell',
          status: 'pending',
          productType: resolvedProductType,
        },
        _sum: { qty: true },
      });
      const alreadyReserved = pendingSellAgg._sum.qty ?? 0;

      let ownedQty = 0;
      if (resolvedProductType === 'MIS' || resolvedProductType === 'NRML') {
        const position = await prisma.position.findFirst({
          where: { userId, instrumentId, productType: resolvedProductType },
        });
        ownedQty = position?.netQty ?? 0;
      } else {
        const holding = await prisma.holding.findFirst({ where: { userId, instrumentId } });
        ownedQty = holding?.qty ?? 0;
      }

      const availableToSell = ownedQty - alreadyReserved;

      if (availableToSell < qty) {
        return res.status(400).json({
          error: `Insufficient quantity available to sell. You have ${availableToSell} unreserved (after accounting for other pending sell orders).`,
        });
      }
    }

    const order = await prisma.order.create({
      data: {
        userId,
        instrumentId,
        type,
        orderType,
        productType: resolvedProductType,
        qty,
        orderPrice,
        validity,
        status: 'pending',
      },
    });

    if (type === 'buy') {
      const newBalance = Number(balance.availableBalance) - orderValue;

      await prisma.balance.update({
        where: { userId },
        data: { availableBalance: newBalance },
      });

      await recordTransaction(
        prisma,
        userId,
        'trade_debit',
        `Blocked funds for BUY ${orderType.toUpperCase()} order on ${instrument.symbol} (Qty: ${qty})`,
        -orderValue,
        newBalance
      );
    }
    // Sell orders: no cash movement, no ledger entry at placement —
    // the shares themselves are reserved via the pending-order check above.

    res.status(201).json(order);
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Something went wrong placing the order' });
  }
});

app.post('/api/orders/:orderId/execute', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawOrderId = req.params.orderId;

    if (!rawOrderId || Array.isArray(rawOrderId)) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const orderId: string = rawOrderId;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ error: 'This order does not belong to you' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: `Order is already ${order.status}` });
    }

    const BROKERAGE_FLAT_FEE = 20;
    const totalPrice = order.qty * Number(order.orderPrice);

    if (order.type === 'sell') {
      if (order.productType === 'MIS' || order.productType === 'NRML') {
        const position = await prisma.position.findFirst({
          where: { userId, instrumentId: order.instrumentId, productType: order.productType },
        });
        if (!position || position.netQty < order.qty) {
          return res.status(400).json({ error: 'Insufficient position quantity to sell' });
        }
      } else {
        const holding = await prisma.holding.findFirst({
          where: { userId, instrumentId: order.instrumentId },
        });
        if (!holding || holding.qty < order.qty) {
          return res.status(400).json({ error: 'Insufficient holdings to sell this quantity' });
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.create({
        data: {
          userId,
          instrumentId: order.instrumentId,
          orderId: order.id,
          pricePerShare: order.orderPrice,
          sharesQty: order.qty,
          totalPrice,
          brokerage: BROKERAGE_FLAT_FEE,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: 'executed' },
      });

      const currentBalance = await tx.balance.findUnique({ where: { userId } });
      if (!currentBalance) {
        throw new Error('Balance not found during execution');
      }

      let runningBalance = Number(currentBalance.availableBalance);

      if (order.type === 'sell') {
        runningBalance += totalPrice;
        await recordTransaction(
          tx,
          userId,
          'trade_credit',
          `Credited sale proceeds for SELL order on ${order.instrument.symbol} (Qty: ${order.qty})`,
          totalPrice,
          runningBalance
        );
      }

      runningBalance -= BROKERAGE_FLAT_FEE;
      await recordTransaction(
        tx,
        userId,
        'charges',
        `Brokerage charged on ${order.type.toUpperCase()} order execution for ${order.instrument.symbol}`,
        -BROKERAGE_FLAT_FEE,
        runningBalance
      );

      await tx.balance.update({
        where: { userId },
        data: { availableBalance: runningBalance },
      });

      if (order.productType === 'MIS' || order.productType === 'NRML') {
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
                avgPrice: order.orderPrice,
              },
            });
          }
        } else {
          const position = existingPosition!;
          const realizedPnl = (Number(order.orderPrice) - Number(position.avgPrice)) * order.qty;
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

      return trade;
    });

    res.status(201).json({ message: 'Order executed successfully', trade: result });
  } catch (error) {
    console.error('Error executing order:', error);
    res.status(500).json({ error: 'Something went wrong executing the order' });
  }
});

app.post('/api/watchlists', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const { name } = req.body;

    const watchlist = await prisma.watchlist.create({
      data: { userId, name },
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
    const { instrumentId } = req.body;

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
    const { dob, pan_no, gender, maritalStatus, occupation, incomeRange } = req.body;

    const existing = await prisma.account.findUnique({ where: { userId } });
    if (existing) {
      return res.status(409).json({ error: 'Account details already exist for this user' });
    }

    const uniqueClientCode = `UCC${Date.now()}`;

    const account = await prisma.account.create({
      data: {
        userId,
        dob: new Date(dob),
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
    const { gender, maritalStatus, occupation, incomeRange } = req.body;

    const existing = await prisma.account.findUnique({ where: { userId } });
    if (!existing) {
      return res.status(404).json({ error: 'Account details not found. Create them first.' });
    }

    const updated = await prisma.account.update({
      where: { userId },
      data: { gender, maritalStatus, occupation, incomeRange },
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
    const { accountNumber, ifscCode, bankBranch } = req.body;

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

app.post('/api/me/deposit', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const { amount } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Deposit amount must be a positive number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({ where: { userId } });
      if (!balance) throw new Error('Balance not found');

      const newBalance = Number(balance.availableBalance) + amount;

      const updated = await tx.balance.update({
        where: { userId },
        data: { availableBalance: newBalance },
      });

      await recordTransaction(tx, userId, 'deposit', `Deposit of ₹${amount}`, amount, newBalance);

      return updated;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error processing deposit:', error);
    res.status(500).json({ error: 'Something went wrong processing the deposit' });
  }
});

app.post('/api/me/withdraw', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const { amount } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Withdrawal amount must be a positive number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({ where: { userId } });
      if (!balance) throw new Error('Balance not found');

      if (Number(balance.availableBalance) < amount) {
        throw new Error('Insufficient balance for this withdrawal');
      }

      const newBalance = Number(balance.availableBalance) - amount;

      const updated = await tx.balance.update({
        where: { userId },
        data: { availableBalance: newBalance },
      });

      await recordTransaction(tx, userId, 'withdrawal', `Withdrawal of ₹${amount}`, -amount, newBalance);

      return updated;
    });

    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong processing the withdrawal';
    console.error('Error processing withdrawal:', error);
    res.status(400).json({ error: message });
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

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

connectToFinnhub(io);
startYahooFinancePolling(io, ['RELIANCE.NS']);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});