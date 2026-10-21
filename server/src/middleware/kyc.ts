import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from './auth';

// Blocks trading until the user's KYC has been verified by an admin.
export async function requireKyc(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const account = await prisma.account.findUnique({
      where: { userId: req.userId as string },
      select: { kycStatus: true, kycNote: true },
    });

    if (!account) {
      return res.status(403).json({
        error: 'Complete your KYC (PAN and date of birth) in Profile & KYC before you can trade',
        code: 'KYC_REQUIRED',
      });
    }
    if (account.kycStatus === 'verified') return next();

    if (account.kycStatus === 'rejected') {
      return res.status(403).json({
        error: `Your KYC was rejected${account.kycNote ? `: ${account.kycNote}` : ''}. Update your details to resubmit.`,
        code: 'KYC_REJECTED',
      });
    }
    return res.status(403).json({
      error: 'Your KYC is waiting for verification. You can trade once it is approved.',
      code: 'KYC_PENDING',
    });
  } catch (error) {
    console.error('Error checking KYC status:', error);
    res.status(500).json({ error: 'Something went wrong checking your KYC status' });
  }
}