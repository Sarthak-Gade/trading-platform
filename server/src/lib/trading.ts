import { Prisma } from '@prisma/client';
import type { Response } from 'express';

export const BROKERAGE_FLAT_FEE = 20;

const ORDER_TYPES = ['market', 'limit'];
const PRODUCT_TYPES = ['CNC', 'MIS', 'NRML'];
const VALIDITIES = ['DAY', 'IOC'];
const MAX_QTY = 100000;
const MAX_PRICE = 10000000;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// Turns a thrown error into the right HTTP response.
export function sendError(res: Response, error: unknown, action: string) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  // P2034 = transaction conflict under Serializable isolation; the client can safely retry
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    return res.status(409).json({
      error: 'Your account was being updated by another request. Please try again.',
    });
  }

  console.error(`Error ${action}:`, error);
  return res.status(500).json({ error: `Something went wrong ${action}` });
}

export interface ValidOrder {
  instrumentId: string;
  type: 'buy' | 'sell';
  orderType: string;
  productType: string;
  qty: number;
  // Only set for limit orders. Market orders are priced by the server from the live quote.
  orderPrice: number | null;
  validity: string;
}

export function validateOrderInput(
  body: unknown
): { ok: true; value: ValidOrder } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const { instrumentId, type, orderType, qty, orderPrice } = b;
  const productType = b.productType ?? 'CNC';
  const validity = b.validity ?? 'DAY';

  if (typeof instrumentId !== 'string' || instrumentId.length === 0) {
    return { ok: false, error: 'instrumentId is required' };
  }
  if (type !== 'buy' && type !== 'sell') {
    return { ok: false, error: 'type must be "buy" or "sell"' };
  }
  if (typeof orderType !== 'string' || !ORDER_TYPES.includes(orderType)) {
    return { ok: false, error: `orderType must be one of: ${ORDER_TYPES.join(', ')}` };
  }
  if (typeof productType !== 'string' || !PRODUCT_TYPES.includes(productType)) {
    return { ok: false, error: `productType must be one of: ${PRODUCT_TYPES.join(', ')}` };
  }
  if (typeof validity !== 'string' || !VALIDITIES.includes(validity)) {
    return { ok: false, error: `validity must be one of: ${VALIDITIES.join(', ')}` };
  }
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
    return { ok: false, error: `qty must be a whole number between 1 and ${MAX_QTY}` };
  }
  // Limit orders must carry a price. For market orders any price sent is ignored,
  // but if one is sent it still has to be sane.
  if (orderType === 'limit' || orderPrice !== undefined) {
    if (typeof orderPrice !== 'number' || !Number.isFinite(orderPrice) || orderPrice <= 0 || orderPrice > MAX_PRICE) {
      return { ok: false, error: 'orderPrice must be a positive number' };
    }
  }

  return {
    ok: true,
    value: {
      instrumentId,
      type,
      orderType,
      productType,
      qty,
      orderPrice: typeof orderPrice === 'number' ? roundMoney(orderPrice) : null,
      validity,
    },
  };
}
