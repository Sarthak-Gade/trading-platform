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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});