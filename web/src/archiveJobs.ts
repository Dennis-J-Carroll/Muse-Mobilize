import type { ProjectManifest } from './types';

export interface ArchiveJob {
  id: string; kind: 'export' | 'import'; state: string; bytes: number; total: number; expiresAt: number;
  error?: { code: string; message: string };
  preview?: { sourceProjectId: string; name: string; capturedAt: string; files: number; savedBytes: number; snapshotHash: string };
  editionPreviewUrl?: string;
  downloadUrl?: string; project?: ProjectManifest;
}
export async function archiveRequest(url: string, body?: unknown, method = 'POST'): Promise<ArchiveJob> {
  const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Archive request failed.');
  return result;
}
export async function waitArchive(job: ArchiveJob, current: () => boolean, progress: (job: ArchiveJob) => void): Promise<ArchiveJob> {
  while (true) {
    if (!current()) throw new Error('Archive operation cancelled.');
    progress(job);
    if (job.state === 'failed' || job.state === 'cancelled') throw new Error(job.error?.message ?? 'Archive operation failed.');
    if (job.state === 'ready' || job.state === 'restored') return job;
    await new Promise(resolve => setTimeout(resolve, 300));
    job = await archiveRequest(`/api/archive-jobs/${job.id}`, undefined, 'GET');
  }
}
/** Sends File directly; browser and server never stringify or base64 the ZIP. */
export function uploadArchive(jobId: string, file: File, signal: AbortSignal, progress: (percent: number) => void): Promise<ArchiveJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    const finish = () => signal.removeEventListener('abort', abort);
    xhr.open('PUT', `/api/archive-jobs/${jobId}/upload`);
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(100 * event.loaded / event.total)); };
    xhr.onload = () => {
      finish();
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) reject(new Error(result.error ?? 'Upload failed.'));
        else resolve(result);
      } catch { reject(new Error('Upload returned an invalid response.')); }
    };
    xhr.onerror = () => { finish(); reject(new Error('Upload interrupted or rejected. Check server status and retry.')); };
    xhr.onabort = () => { finish(); reject(new Error('Upload cancelled.')); };
    if (signal.aborted) { finish(); reject(new Error('Upload cancelled.')); return; }
    xhr.send(file);
  });
}
