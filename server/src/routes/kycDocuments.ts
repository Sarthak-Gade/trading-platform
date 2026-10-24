import express, { Router } from 'express';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth, requireAdmin } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { rateLimit, byUser } from '../middleware/rateLimit';
import { HttpError, sendError } from '../lib/trading';
import {
  KYC_REQUIRED,
  MAX_KYC_FILE_BYTES,
  cleanFileName,
  detectFileType,
  isKycDocType,
  missingRequiredDocs,
} from '../lib/kycDocuments';
import type { KycDocType } from '../lib/kycDocuments';

const router = Router();

const uploadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 20,
  message: 'Too many uploads. Please wait a few minutes and try again.',
  key: byUser,
});

// The file is sent as the request body itself (no multipart form), so no extra upload library is needed
const rawFile = express.raw({ type: ['image/jpeg', 'image/png', 'application/pdf'], limit: MAX_KYC_FILE_BYTES });

// Everything except the file bytes, which are heavy and only read when a file is opened
const META = {
  type: true,
  fileName: true,
  mimeType: true,
  size: true,
  uploadedAt: true,
} satisfies Prisma.KycDocumentSelect;

function docType(raw: string | string[] | undefined): KycDocType {
  if (!raw || Array.isArray(raw) || !isKycDocType(raw)) {
    throw new HttpError(400, 'Document type must be pan_card, address_proof or photo');
  }
  return raw;
}

function userParam(raw: string | string[] | undefined): string {
  if (!raw || Array.isArray(raw)) throw new HttpError(400, 'User ID is required');
  return raw;
}

function sendFile(res: Response, doc: { fileName: string; mimeType: string; data: Uint8Array }) {
  const bytes = Buffer.from(doc.data);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(bytes);
}

// ---------- The user's own documents ----------
router.get('/me/kyc/documents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const documents = await prisma.kycDocument.findMany({ where: { userId }, select: META });
    res.json({
      documents,
      required: KYC_REQUIRED,
      missing: await missingRequiredDocs(userId),
    });
  } catch (error) {
    sendError(res, error, 'fetching your KYC documents');
  }
});

router.put('/me/kyc/documents/:type', requireAuth, uploadLimiter, rawFile, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const type = docType(req.params.type);

    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new HttpError(400, 'Send a JPG, PNG or PDF file of up to 5 MB');
    }
    const kind = detectFileType(body);
    if (!kind) throw new HttpError(400, 'Only JPG, PNG or PDF files are accepted');
    if (type === 'photo' && kind.mime === 'application/pdf') throw new HttpError(400, 'The photo must be a JPG or PNG image');

    const account = await prisma.account.findUnique({ where: { userId }, select: { kycStatus: true } });
    if (!account) throw new HttpError(404, 'Save your KYC details first, then upload your documents');
    if (account.kycStatus === 'verified') throw new HttpError(409, 'Your KYC is verified, so its documents are locked');

    const rawName = req.headers['x-file-name'];
    const fileName = cleanFileName(typeof rawName === 'string' ? rawName : undefined, `${type}.${kind.ext}`);
    const bytes = new Uint8Array(body);

    // A rejected KYC goes back to pending as soon as the user sends a new document
    const [saved] = await prisma.$transaction([
      prisma.kycDocument.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type, fileName, mimeType: kind.mime, size: body.length, data: bytes },
        update: { fileName, mimeType: kind.mime, size: body.length, data: bytes, uploadedAt: new Date() },
        select: META,
      }),
      prisma.account.updateMany({
        where: { userId, kycStatus: 'rejected' },
        data: { kycStatus: 'pending', kycNote: null },
      }),
    ]);

    res.json(saved);
  } catch (error) {
    sendError(res, error, 'saving the document');
  }
});

router.get('/me/kyc/documents/:type/file', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const type = docType(req.params.type);
    const doc = await prisma.kycDocument.findUnique({ where: { userId_type: { userId, type } } });
    if (!doc) throw new HttpError(404, 'Document not found');
    sendFile(res, doc);
  } catch (error) {
    sendError(res, error, 'opening the document');
  }
});

router.delete('/me/kyc/documents/:type', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId as string;
    const type = docType(req.params.type);

    const account = await prisma.account.findUnique({ where: { userId }, select: { kycStatus: true } });
    if (account?.kycStatus === 'verified') throw new HttpError(409, 'Your KYC is verified, so its documents are locked');

    const result = await prisma.kycDocument.deleteMany({ where: { userId, type } });
    if (result.count === 0) throw new HttpError(404, 'Document not found');
    res.json({ message: 'Document removed' });
  } catch (error) {
    sendError(res, error, 'removing the document');
  }
});

// ---------- Admin: look at a user's documents while reviewing ----------
router.get('/admin/kyc/:userId/documents', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = userParam(req.params.userId);
    const documents = await prisma.kycDocument.findMany({ where: { userId }, select: META });
    res.json({ documents, required: KYC_REQUIRED, missing: await missingRequiredDocs(userId) });
  } catch (error) {
    sendError(res, error, 'fetching the KYC documents');
  }
});

router.get('/admin/kyc/:userId/documents/:type/file', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const userId = userParam(req.params.userId);
    const type = docType(req.params.type);
    const doc = await prisma.kycDocument.findUnique({ where: { userId_type: { userId, type } } });
    if (!doc) throw new HttpError(404, 'Document not found');
    sendFile(res, doc);
  } catch (error) {
    sendError(res, error, 'opening the document');
  }
});

export default router;