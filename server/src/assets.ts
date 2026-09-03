import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, safeJoin } from './paths.js';
import type { StoryImage } from './types.js';

export interface ImageAssetInput {
  name: string;
  mimeType: string;
  data: string;
}

export interface StoredImageAsset {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean);

export function cleanStoryImages(value: unknown): StoryImage[] {
  return (Array.isArray(value) ? value : [])
    .map((image: any) => ({
      id: String(image?.id ?? '').trim() || randomUUID(),
      src: String(image?.src ?? '').trim(),
      caption: String(image?.caption ?? '').trim(),
      tags: strings(image?.tags),
    }))
    .filter((image: StoryImage) => Boolean(image.src));
}

function matchesImageSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  if (mimeType === 'image/webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'image/avif') return bytes.subarray(4, 12).toString('ascii').startsWith('ftypavi');
  return false;
}

export function imageAssetPath(projectDir: string, fileName: string): string {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|avif)$/.test(fileName)) throw new Error('valid image asset name is required');
  return safeJoin(projectDir, path.join('assets', 'images', fileName));
}

export async function saveImageAsset(projectDir: string, input: ImageAssetInput): Promise<StoredImageAsset> {
  const mimeType = String(input.mimeType ?? '').trim().toLowerCase();
  const extension = IMAGE_EXTENSIONS[mimeType];
  if (!extension) throw new Error('supported image type required: PNG, JPEG, WebP, GIF, or AVIF');
  const data = String(input.data ?? '').replace(/\s+/g, '');
  if (!data || !/^[a-z0-9+/]+={0,2}$/i.test(data)) throw new Error('valid base64 image data is required');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) throw new Error('image file is empty');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('image must be 5 MB or smaller');
  if (!matchesImageSignature(bytes, mimeType)) throw new Error('file contents do not match image type');
  const fileName = `${randomUUID()}.${extension}`;
  const destination = imageAssetPath(projectDir, fileName);
  await ensureDir(path.dirname(destination));
  await fs.writeFile(destination, bytes);
  return {
    fileName,
    originalName: path.basename(String(input.name ?? '').trim()) || `image.${extension}`,
    mimeType,
    size: bytes.length,
  };
}
