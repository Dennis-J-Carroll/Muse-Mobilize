import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, safeJoin } from './paths.js';

export interface MediaAssetInput {
  name: string;
  mimeType: string;
  data: string;
}

export interface StoredMediaAsset {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

// A small-reference-clip policy for this first version (see
// docs/media-desk-architecture.md, "Backups, undo, and asset lifetime"):
// 25 MB decoded stays comfortably under the 50 MiB saved-project-files
// backup cap and 80 MiB encoded-backup cap even with a few clips saved.
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MEDIA_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function matchesMediaSignature(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'audio/mpeg') {
    return bytes.length >= 3 && (bytes.subarray(0, 3).toString('ascii') === 'ID3'
      || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  }
  if (mimeType === 'audio/wav') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WAVE';
  }
  if (mimeType === 'video/mp4') {
    return bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (mimeType === 'video/webm') {
    return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  return false;
}

const MANAGED_MEDIA_PATH = /\/assets\/media\/([^/?#]+\.(?:mp3|wav|mp4|webm))$/i;

export function managedMediaFileName(src: string): string | null {
  const match = MANAGED_MEDIA_PATH.exec(String(src ?? ''));
  return match ? match[1] : null;
}

export function mediaAssetPath(projectDir: string, fileName: string): string {
  if (!/^[a-f0-9-]{36}\.(mp3|wav|mp4|webm)$/.test(fileName)) throw new Error('valid media asset name is required');
  return safeJoin(projectDir, path.join('assets', 'media', fileName));
}

export async function saveMediaAsset(projectDir: string, input: MediaAssetInput): Promise<StoredMediaAsset> {
  const mimeType = String(input.mimeType ?? '').trim().toLowerCase();
  const extension = MEDIA_EXTENSIONS[mimeType];
  if (!extension) throw new Error('supported media type required: MP3, WAV, MP4, or WebM');
  const data = String(input.data ?? '').replace(/\s+/g, '');
  if (!data || !/^[a-z0-9+/]+={0,2}$/i.test(data)) throw new Error('valid base64 media data is required');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length) throw new Error('media file is empty');
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error('media file must be 25 MB or smaller');
  if (!matchesMediaSignature(bytes, mimeType)) throw new Error('file contents do not match media type');
  const fileName = `${randomUUID()}.${extension}`;
  const destination = mediaAssetPath(projectDir, fileName);
  await ensureDir(path.dirname(destination));
  await fs.writeFile(destination, bytes);
  return {
    fileName,
    originalName: path.basename(String(input.name ?? '').trim()) || `media.${extension}`,
    mimeType,
    size: bytes.length,
  };
}
