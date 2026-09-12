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

app.post('/api/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const { instrumentId, type, orderType, productType, qty, orderPrice, validity } = req.body;

    const instrument = await prisma.instrument.findUnique({
      where: { id: instrumentId },
    });

    if (!instrument) {
      return res.status(404).json({ error: 'Instrument not found' });
    }

    const balance = await prisma.balance.findUnique({
      where: { userId },
    });

    if (!balance) {
      return res.status(404).json({ error: 'User balance not found' });
    }

    const orderValue = qty * orderPrice;

    if (Number(balance.availableBalance) < orderValue) {
      return res.status(400).json({ error: 'Insufficient balance to place this order' });
    }

    const order = await prisma.order.create({
      data: {
        userId,
        instrumentId,
        type,
        orderType,
        productType: productType || 'CNC',
        qty,
        orderPrice,
        validity,
        status: 'pending',
      },
    });

    await prisma.balance.update({
      where: { userId },
      data: {
        availableBalance: Number(balance.availableBalance) - orderValue,
      },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Something went wrong placing the order' });
  }
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

app.post('/api/orders/:orderId/execute', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const rawOrderId = req.params.orderId;

    if (!rawOrderId || Array.isArray(rawOrderId)) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const orderId: string = rawOrderId;

    const order = await prisma.order.findUnique({ where: { id: orderId } });

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

    // Single, correct sell-validation block (checks Position for MIS/NRML, Holding for CNC)
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

      if (order.productType === 'MIS' || order.productType === 'NRML') {
        // Intraday / F&O → Positions
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
        // CNC (delivery) → Holdings
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