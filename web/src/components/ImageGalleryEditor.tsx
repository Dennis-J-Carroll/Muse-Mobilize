import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { StoryImage } from '../types';

interface ImageGalleryEditorProps {
  images: StoryImage[];
  onChange: (images: StoryImage[]) => void;
  noun?: string;
  coverLabel?: string | false;
  onBusyChange?: (busy: boolean) => void;
}

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_BATCH_LIMIT = 12;
export const IMAGE_UPLOAD_CONCURRENCY = 3;
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export interface ImageUploadIssue {
  fileName: string;
  reason: string;
}

export function preflightImageFiles(files: File[]): { accepted: File[]; issues: ImageUploadIssue[] } {
  const valid: File[] = [];
  const issues: ImageUploadIssue[] = [];

  for (const file of files) {
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
      issues.push({ fileName: file.name, reason: file.type ? `unsupported type ${file.type}` : 'missing image type' });
    } else if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      issues.push({ fileName: file.name, reason: 'larger than 5 MB' });
    } else {
      valid.push(file);
    }
  }

  const accepted = valid.slice(0, IMAGE_UPLOAD_BATCH_LIMIT);
  for (const file of valid.slice(IMAGE_UPLOAD_BATCH_LIMIT)) {
    issues.push({ fileName: file.name, reason: `over ${IMAGE_UPLOAD_BATCH_LIMIT}-image batch limit` });
  }
  return { accepted, issues };
}

export function formatImageUploadIssues(issues: ImageUploadIssue[]): string {
  const visible = issues.slice(0, 4).map((issue) => `${issue.fileName}: ${issue.reason}`);
  const remainder = issues.length - visible.length;
  return `${issues.length} image${issues.length === 1 ? '' : 's'} skipped: ${visible.join('; ')}${remainder > 0 ? `; plus ${remainder} more` : ''}.`;
}

export function createConcurrencyLimiter(limit: number) {
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = async () => {
    if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
  };

  const release = () => {
    active -= 1;
    waiters.shift()?.();
  };

  return async <T,>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

export function mergeStoryImages(current: StoryImage[], incoming: StoryImage[]): StoryImage[] {
  const known = new Set(current.map((image) => image.id));
  const additions: StoryImage[] = [];
  for (const image of incoming) {
    if (known.has(image.id)) continue;
    known.add(image.id);
    additions.push(image);
  }
  return [...current, ...additions];
}

export function collectImageUploadResults(
  files: File[],
  results: PromiseSettledResult<StoryImage>[],
): { successful: StoryImage[]; issues: ImageUploadIssue[] } {
  const successful: StoryImage[] = [];
  const issues: ImageUploadIssue[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
      return;
    }
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    issues.push({ fileName: files[index]?.name ?? `image ${index + 1}`, reason });
  });
  return { successful, issues };
}

const imageId = () => globalThis.crypto?.randomUUID?.() ?? `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ImageGalleryEditor({ images, onChange, noun = 'reference', coverLabel = 'Cover', onBusyChange }: ImageGalleryEditorProps) {
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  const pendingBatchesRef = useRef(0);
  const uploadSummaryRef = useRef<{ uploaded: number; issues: ImageUploadIssue[] }>({ uploaded: 0, issues: [] });
  const runUpload = useRef(createConcurrencyLimiter(IMAGE_UPLOAD_CONCURRENCY)).current;
  imagesRef.current = images;

  const updateImages = (update: (current: StoryImage[]) => StoryImage[]) => {
    const next = update(imagesRef.current);
    imagesRef.current = next;
    onChange(next);
  };

  const beginBatch = () => {
    if (pendingBatchesRef.current === 0) {
      uploadSummaryRef.current = { uploaded: 0, issues: [] };
      setUploading(true);
      onBusyChange?.(true);
    }
    pendingBatchesRef.current += 1;
  };

  const finishBatch = () => {
    pendingBatchesRef.current -= 1;
    if (pendingBatchesRef.current > 0) return;

    const { uploaded, issues } = uploadSummaryRef.current;
    useStore.setState({
      notice: uploaded > 0 ? `${uploaded} image${uploaded === 1 ? '' : 's'} added to project images.` : null,
      error: issues.length > 0 ? formatImageUploadIssues(issues) : null,
    });
    setUploading(false);
    onBusyChange?.(false);
  };

  const addFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    const { accepted, issues } = preflightImageFiles(selected);
    beginBatch();
    uploadSummaryRef.current.issues.push(...issues);
    try {
      const uploaded = await Promise.allSettled(
        accepted.map((file) => runUpload(() => useStore.getState().uploadStoryImage(file))),
      );
      const { successful, issues: uploadIssues } = collectImageUploadResults(accepted, uploaded);
      uploadSummaryRef.current.issues.push(...uploadIssues);
      if (successful.length) {
        uploadSummaryRef.current.uploaded += successful.length;
        updateImages((current) => mergeStoryImages(current, successful));
      }
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      finishBatch();
    }
  };

  const addUrl = () => {
    const src = url.trim();
    if (!src) return;
    updateImages((current) => [...current, { id: imageId(), src, caption: '', tags: [] }]);
    setUrl('');
  };

  const revise = (id: string, patch: Partial<StoryImage>) =>
    updateImages((current) => current.map((image) => (image.id === id ? { ...image, ...patch } : image)));

  return (
    <div className="image-gallery-editor" aria-busy={uploading}>
      <div
        className={`image-drop ${uploading ? 'is-uploading' : ''}`}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}
      >
        <span className="image-drop-mark">▧</span>
        <p><strong>{uploading ? 'Adding images…' : `Drop ${noun} images here`}</strong><small>PNG, JPEG, WebP, GIF, or AVIF · up to 5 MB each</small></p>
        <label className="btn image-choose">Choose images<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple onChange={(event) => { if (event.target.files) void addFiles(event.target.files); }} /></label>
      </div>

      <div className="image-link-row">
        <input aria-label={`Add ${noun} image URL`} value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addUrl(); } }} placeholder="Or paste image URL" />
        <button type="button" className="linkish" disabled={!url.trim()} onClick={addUrl}>Add link</button>
      </div>

      {images.length > 0 && <div className="image-contact-sheet">
        {images.map((image, index) => <figure key={image.id}>
          <div><img src={image.src} alt={image.caption || `${noun} image ${index + 1}`} loading="lazy" /><button type="button" aria-label={`Remove ${noun} image ${index + 1}`} onClick={() => updateImages((current) => current.filter((item) => item.id !== image.id))}>×</button>{index === 0 && coverLabel && <span>{coverLabel}</span>}</div>
          <input aria-label={`Caption for ${noun} image ${index + 1}`} value={image.caption} onChange={(event) => revise(image.id, { caption: event.target.value })} placeholder="Add caption" />
        </figure>)}
      </div>}
    </div>
  );
}

export function StoryImageStrip({ images, label }: { images: StoryImage[]; label: string }) {
  if (!images.length) return null;
  return <div className="story-image-strip" aria-label={label}>{images.map((image, index) => <figure key={image.id}><img src={image.src} alt={image.caption || `${label} ${index + 1}`} loading="lazy" />{image.caption && <figcaption>{image.caption}</figcaption>}</figure>)}</div>;
}
