import prisma from './prisma';

export const KYC_DOC_TYPES = ['pan_card', 'address_proof', 'photo'] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];

// Both of these must be uploaded before an admin can approve a KYC. The photo is optional.
export const KYC_REQUIRED: KycDocType[] = ['pan_card', 'address_proof'];

export const KYC_DOC_LABELS: Record<KycDocType, string> = {
  pan_card: 'PAN card',
  address_proof: 'Address proof',
  photo: 'Photo',
};

export const MAX_KYC_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function isKycDocType(value: string): value is KycDocType {
  return (KYC_DOC_TYPES as readonly string[]).includes(value);
}

// Works out what a file really is from its first bytes, so a renamed .exe is never accepted as a PDF
export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  return null;
}

// The file name arrives URL-encoded in a header. Keep only safe characters, so it can never
// carry a path or break the download header.
export function cleanFileName(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // keep the raw text
  }
  name = name
    .replace(/^.*[\\/]/, '')
    .replace(/[^A-Za-z0-9._ ()-]/g, '_')
    .trim()
    .slice(-80);
  return name && name !== '.' && name !== '..' ? name : fallback;
}

// The required documents a user has not uploaded yet
export async function missingRequiredDocs(userId: string): Promise<KycDocType[]> {
  const rows = await prisma.kycDocument.findMany({ where: { userId }, select: { type: true } });
  const have = new Set(rows.map((r) => r.type));
  return KYC_REQUIRED.filter((t) => !have.has(t));
}