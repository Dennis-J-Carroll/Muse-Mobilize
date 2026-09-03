import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { StoryImage } from '../types';

interface ImageGalleryEditorProps {
  images: StoryImage[];
  onChange: (images: StoryImage[]) => void;
  noun?: string;
}

const imageId = () => globalThis.crypto?.randomUUID?.() ?? `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ImageGalleryEditor({ images, onChange, noun = 'reference' }: ImageGalleryEditorProps) {
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!selected.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(selected.map((file) => useStore.getState().uploadStoryImage(file)));
      const successful = uploaded.filter((image): image is StoryImage => Boolean(image));
      if (successful.length) onChange([...images, ...successful]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const addUrl = () => {
    const src = url.trim();
    if (!src) return;
    onChange([...images, { id: imageId(), src, caption: '', tags: [] }]);
    setUrl('');
  };

  const revise = (id: string, patch: Partial<StoryImage>) =>
    onChange(images.map((image) => (image.id === id ? { ...image, ...patch } : image)));

  return (
    <div className="image-gallery-editor">
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
          <div><img src={image.src} alt={image.caption || `${noun} image ${index + 1}`} loading="lazy" /><button type="button" aria-label={`Remove ${noun} image ${index + 1}`} onClick={() => onChange(images.filter((item) => item.id !== image.id))}>×</button>{index === 0 && <span>Cover</span>}</div>
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
