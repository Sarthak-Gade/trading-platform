import { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';

interface Options {
  // Window length and how many requests are allowed inside it
  windowMs: number;
  max: number;
  message: string;
  // Who is being counted. Defaults to the caller's IP address.
  key?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// A small in-memory limiter (fixed window). It is per server process, which is right for one
// server; with several servers behind a load balancer the counts would need a shared store.
export function rateLimit(options: Options) {
  const buckets = new Map<string, Bucket>();

  // Drop expired buckets so the map can't grow forever
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(options.windowMs, 60_000));
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = options.key ? options.key(req) : req.ip || 'unknown';

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: options.message });
    }

    next();
  };
}

// For routes behind requireAuth: count per logged-in user instead of per IP
export const byUser = (req: Request): string => (req as AuthRequest).userId || req.ip || 'unknown';

const MINUTE = 60_000;

export const generalLimiter = rateLimit({
  windowMs: MINUTE,
  max: 600,
  message: 'Too many requests. Please slow down and try again shortly.',
});

export const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  max: 10,
  message: 'Too many login attempts. Please try again in a few minutes.',
});

export const signupLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  max: 10,
  message: 'Too many accounts created from this network. Please try again later.',
});

export const orderLimiter = rateLimit({
  windowMs: MINUTE,
  max: 30,
  key: byUser,
  message: 'You are placing orders too quickly. Please wait a moment.',
});

export const moneyLimiter = rateLimit({
  windowMs: MINUTE,
  max: 20,
  key: byUser,
  message: 'Too many wallet requests. Please wait a moment.',
});