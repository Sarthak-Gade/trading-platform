import express, { Request, Response } from 'express';
import prisma from './lib/prisma';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Trading platform server is running' });
});

app.get('/api/users/:id/balance', async (req: Request, res: Response) => {
  const { id } = req.params;

  const balance = await prisma.balance.findUnique({
    where: { userId: id },
  });

  if (!balance) {
    return res.status(404).json({ error: 'Balance not found for this user' });
  }

  res.json(balance);
});

app.post('/api/orders', async (req: Request, res: Response) => {
  try {
    const { userId, instrumentId, type, orderType, qty, orderPrice, validity } = req.body;

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});